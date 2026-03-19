/**
 * Background Service Worker - WebSocket connection and command routing.
 * 使用 chrome.alarms 在 Service Worker 休眠后唤醒并重连（setTimeout 在休眠时会失效）。
 */

const WS_URL = 'ws://localhost:53421';
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
const RECONNECT_DELAY = 2000;
const HEARTBEAT_INTERVAL = 8000; // 8s 心跳
const ALARM_PERIOD_MINUTES = 0.5; // 30s，Chrome 允许的最小周期

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[imoo-browser] Connected to CLI');
      ws.send(JSON.stringify({ type: 'PING', ts: Date.now() })); // 立即发送，让 CLI 快速识别连接
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

async function handleCommand(msg) {
  const { id, action, params = {} } = msg;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendToCli({ id, success: false, error: 'No active tab' });
      return;
    }

    if (action === 'navigate') {
      await chrome.tabs.update(tab.id, { url: params.url });
      sendToCli({ id, success: true, result: { navigated: params.url } });
      return;
    }

    // Content script actions: click, type, evaluate, snapshot
    chrome.tabs.sendMessage(tab.id, {
      type: 'EXECUTE_COMMAND',
      action,
      params,
    }, (response) => {
      if (chrome.runtime.lastError) {
        sendToCli({
          id,
          success: false,
          error: chrome.runtime.lastError.message || 'Content script not ready',
        });
        return;
      }
      sendToCli({ id, ...response });
    });
  } catch (err) {
    sendToCli({ id, success: false, error: err?.message || String(err) });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'RECONNECT') {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    ws?.close();
    ws = null;
    connect();
    sendResponse({ ok: true });
  } else if (message === 'STATUS') {
    sendResponse({ connected: ws?.readyState === WebSocket.OPEN });
  } else if (message?.type === 'PAGE_EVENT' && message.payload) {
    sendToCli(message.payload);
  }
  return true;
});

// Service Worker 休眠后 setTimeout 不会执行，chrome.alarms 仍会触发
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
