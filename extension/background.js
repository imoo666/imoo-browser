/**
 * Background Service Worker - WebSocket connection and CDP-based command routing.
 * 使用 chrome.debugger API 获得完整的 Chrome DevTools Protocol 能力。
 */

const WS_URL = 'ws://localhost:53421';
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
const RECONNECT_DELAY = 2000;
const HEARTBEAT_INTERVAL = 8000;
const ALARM_PERIOD_MINUTES = 0.5;

// CDP debugger state
let debuggerAttached = false;
let currentTabId = null;

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[imoo-browser] Connected to CLI');
      ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
      startHeartbeat();
    };

    ws.onclose = () => {
      ws = null;
      stopHeartbeat();
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleCommand(msg);
      } catch (err) {
        sendToCli({ id: null, success: false, error: err?.message });
      }
    };
  } catch (err) {
    console.error('[imoo-browser] WebSocket error:', err);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function sendToCli(data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Attach debugger to current tab
async function ensureDebugger() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');

  if (currentTabId === tab.id && debuggerAttached) {
    return tab.id;
  }

  // Detach from previous tab if any
  if (debuggerAttached && currentTabId) {
    try {
      await chrome.debugger.detach({ tabId: currentTabId });
    } catch {}
  }

  // Attach to new tab
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    debuggerAttached = true;
    currentTabId = tab.id;

    // Enable necessary CDP domains
    await sendCDP(tab.id, 'Page.enable');
    await sendCDP(tab.id, 'DOM.enable');
    await sendCDP(tab.id, 'Runtime.enable');
    await sendCDP(tab.id, 'Network.enable');
  } catch (err) {
    debuggerAttached = false;
    throw new Error(`Failed to attach debugger: ${err.message}`);
  }

  return tab.id;
}

// Send CDP command
function sendCDP(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function handleCommand(msg) {
  const { id, action, params = {} } = msg;

  try {
    let result;

    switch (action) {
      case 'navigate': {
        const tabId = await ensureDebugger();
        await sendCDP(tabId, 'Page.navigate', { url: params.url });
        result = { navigated: params.url };
        break;
      }

      case 'screenshot': {
        const tabId = await ensureDebugger();
        const cdpParams = {
          format: params.encoding === 'binary' ? 'png' : 'png',
          fromSurface: true,
        };
        if (params.fullPage) {
          const layout = await sendCDP(tabId, 'Page.getLayoutMetrics');
          cdpParams.clip = {
            x: 0,
            y: 0,
            width: layout.contentSize.width,
            height: layout.contentSize.height,
            scale: 1
          };
        }
        const { data } = await sendCDP(tabId, 'Page.captureScreenshot', cdpParams);
        result = { data }; // base64 encoded
        break;
      }

      case 'pdf': {
        const tabId = await ensureDebugger();
        const { data } = await sendCDP(tabId, 'Page.printToPDF', params.options || {});
        result = { data }; // base64 encoded
        break;
      }

      case 'click': {
        const tabId = await ensureDebugger();
        const nodeId = await getNodeBySelector(tabId, params.selector);
        const { model } = await sendCDP(tabId, 'DOM.getBoxModel', { nodeId });
        const [x, y] = model.content; // top-left corner
        await sendCDP(tabId, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x, y,
          button: 'left',
          clickCount: 1
        });
        await sendCDP(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x, y,
          button: 'left',
          clickCount: 1
        });
        result = { clicked: true };
        break;
      }

      case 'type': {
        const tabId = await ensureDebugger();
        const nodeId = await getNodeBySelector(tabId, params.selector);
        await sendCDP(tabId, 'DOM.focus', { nodeId });

        // Type each character
        for (const char of params.text || '') {
          await sendCDP(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyDown',
            text: char
          });
          await sendCDP(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            text: char
          });
        }
        result = { typed: true };
        break;
      }

      case 'evaluate': {
        const tabId = await ensureDebugger();
        const { result: evalResult, exceptionDetails } = await sendCDP(tabId, 'Runtime.evaluate', {
          expression: params.expression,
          returnByValue: true,
          awaitPromise: true
        });
        if (exceptionDetails) {
          throw new Error(exceptionDetails.text || 'Evaluation failed');
        }
        result = evalResult.value;
        break;
      }

      case 'waitForSelector': {
        const tabId = await ensureDebugger();
        const timeout = params.timeout || 30000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          try {
            await getNodeBySelector(tabId, params.selector);
            result = { found: true };
            break;
          } catch {
            await new Promise(r => setTimeout(r, 100));
          }
        }

        if (!result) {
          throw new Error(`Timeout waiting for selector: ${params.selector}`);
        }
        break;
      }

      case 'waitForNavigation': {
        const tabId = await ensureDebugger();
        const timeout = params.timeout || 30000;

        result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            chrome.debugger.onEvent.removeListener(listener);
            reject(new Error('Navigation timeout'));
          }, timeout);

          const listener = (source, method) => {
            if (source.tabId === tabId && method === 'Page.loadEventFired') {
              clearTimeout(timer);
              chrome.debugger.onEvent.removeListener(listener);
              resolve({ loaded: true });
            }
          };

          chrome.debugger.onEvent.addListener(listener);
        });
        break;
      }

      case 'getCookies': {
        const tabId = await ensureDebugger();
        const { cookies } = await sendCDP(tabId, 'Network.getCookies', params.urls ? { urls: params.urls } : {});
        result = cookies;
        break;
      }

      case 'setCookies': {
        const tabId = await ensureDebugger();
        for (const cookie of params.cookies || []) {
          await sendCDP(tabId, 'Network.setCookie', cookie);
        }
        result = { set: true };
        break;
      }

      case 'deleteCookies': {
        const tabId = await ensureDebugger();
        for (const cookie of params.cookies || []) {
          await sendCDP(tabId, 'Network.deleteCookies', {
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path
          });
        }
        result = { deleted: true };
        break;
      }

      case 'content': {
        const tabId = await ensureDebugger();
        const { root } = await sendCDP(tabId, 'DOM.getDocument');
        const { outerHTML } = await sendCDP(tabId, 'DOM.getOuterHTML', { nodeId: root.nodeId });
        result = outerHTML;
        break;
      }

      case 'title': {
        const tabId = await ensureDebugger();
        const { result: evalResult } = await sendCDP(tabId, 'Runtime.evaluate', {
          expression: 'document.title',
          returnByValue: true
        });
        result = evalResult.value;
        break;
      }

      case 'url': {
        const tabId = await ensureDebugger();
        const { result: evalResult } = await sendCDP(tabId, 'Runtime.evaluate', {
          expression: 'location.href',
          returnByValue: true
        });
        result = evalResult.value;
        break;
      }

      case 'querySelector': {
        const tabId = await ensureDebugger();
        const nodeId = await getNodeBySelector(tabId, params.selector);
        result = { nodeId };
        break;
      }

      case 'querySelectorAll': {
        const tabId = await ensureDebugger();
        const { root } = await sendCDP(tabId, 'DOM.getDocument');
        const { nodeIds } = await sendCDP(tabId, 'DOM.querySelectorAll', {
          nodeId: root.nodeId,
          selector: params.selector
        });
        result = { nodeIds };
        break;
      }

      case 'getNodeInfo': {
        const tabId = await ensureDebugger();
        const { node } = await sendCDP(tabId, 'DOM.describeNode', { nodeId: params.nodeId });
        result = node;
        break;
      }

      case 'scroll': {
        const tabId = await ensureDebugger();
        if (params.selector) {
          const nodeId = await getNodeBySelector(tabId, params.selector);
          await sendCDP(tabId, 'DOM.scrollIntoViewIfNeeded', { nodeId });
        } else {
          await sendCDP(tabId, 'Runtime.evaluate', {
            expression: `window.scrollTo(${params.x || 0}, ${params.y || 0})`
          });
        }
        result = { scrolled: true };
        break;
      }

      case 'setViewport': {
        const tabId = await ensureDebugger();
        await sendCDP(tabId, 'Emulation.setDeviceMetricsOverride', {
          width: params.width,
          height: params.height,
          deviceScaleFactor: params.deviceScaleFactor || 1,
          mobile: params.mobile || false
        });
        result = { set: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    sendToCli({ id, success: true, result });
  } catch (err) {
    sendToCli({ id, success: false, error: err?.message || String(err) });
  }
}

// Helper: Get DOM node by CSS selector
async function getNodeBySelector(tabId, selector) {
  const { root } = await sendCDP(tabId, 'DOM.getDocument');
  const { nodeId } = await sendCDP(tabId, 'DOM.querySelector', {
    nodeId: root.nodeId,
    selector
  });
  if (!nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }
  return nodeId;
}

// Listen for CDP events and forward to CLI
chrome.debugger.onEvent.addListener((source, method, params) => {
  // Forward console messages
  if (method === 'Runtime.consoleAPICalled') {
    sendToCli({
      type: 'PAGE_EVENT',
      payload: {
        type: 'console',
        level: params.type,
        args: params.args.map(arg => arg.value),
        timestamp: params.timestamp
      }
    });
  }

  // Forward network events
  if (method === 'Network.requestWillBeSent') {
    sendToCli({
      type: 'PAGE_EVENT',
      payload: {
        type: 'network',
        event: 'request',
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method
      }
    });
  }

  if (method === 'Network.responseReceived') {
    sendToCli({
      type: 'PAGE_EVENT',
      payload: {
        type: 'network',
        event: 'response',
        requestId: params.requestId,
        status: params.response.status,
        url: params.response.url
      }
    });
  }
});

// Handle detach events
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === currentTabId) {
    debuggerAttached = false;
    currentTabId = null;
    console.log('[imoo-browser] Debugger detached:', reason);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'RECONNECT') {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    ws?.close();
    ws = null;
    connect();
    sendResponse({ ok: true });
  } else if (message === 'STATUS') {
    sendResponse({
      connected: ws?.readyState === WebSocket.OPEN,
      debuggerAttached
    });
  }
  return true;
});

// Service Worker keepalive
chrome.alarms.create('keepalive-reconnect', {
  periodInMinutes: ALARM_PERIOD_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive-reconnect') {
    const disconnected = !ws || ws.readyState !== WebSocket.OPEN;
    if (disconnected) {
      connect();
    }
  }
});

connect();
