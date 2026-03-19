#!/usr/bin/env node

/**
 * imoo-browser CLI entry.
 * Usage: node cli.js                    - REPL mode
 *        node cli.js --daemon           - daemon mode (WS server only, keep running)
 *        node cli.js --command "..."    - single command (connects to daemon if available)
 */

import { createServer, sendCommand, isConnected, closeServer } from '../src/server.js';
import WebSocket from 'ws';
import { createInterface } from 'readline';
import { appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 53421;
const portIndex = process.argv.indexOf('--port');
const PORT = portIndex >= 0 && process.argv[portIndex + 1]
  ? parseInt(process.argv[portIndex + 1], 10)
  : DEFAULT_PORT;
let commandId = 0;
let pendingResolve = null;

function nextId() {
  return `cmd-${++commandId}`;
}

function formatEvent(ev) {
  if (ev.type === 'console') {
    const prefix = `[${ev.level.toUpperCase()}]`;
    return `${prefix} ${(ev.args || []).join(' ')}`;
  }
  if (ev.type === 'network') {
    return `[NET] ${ev.method} ${ev.url} ${ev.status || ''} ${ev.duration ? ev.duration + 'ms' : ''}`;
  }
  if (ev.type === 'error') {
    return `[ERROR] ${ev.message}`;
  }
  return JSON.stringify(ev);
}

const pendingCommands = new Map();

async function runCommand(action, params = {}) {
  const id = nextId();
  return new Promise((resolve) => {
    pendingCommands.set(id, resolve);
    sendCommand({ id, action, params }).catch((err) => {
      pendingCommands.delete(id);
      console.error(err.message);
      resolve(null);
    });
  });
}

function handleCommandResponse(msg) {
  const resolve = pendingCommands.get(msg.id);
  if (resolve) {
    pendingCommands.delete(msg.id);
    if (msg.success) {
      resolve(msg.result);
    } else {
      resolve(null);
    }
  }
}

function parseAndRun(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'navigate': {
      let url = args[0];
      if (!url) return Promise.reject(new Error('Usage: navigate <url>'));
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      return runCommand('navigate', { url });
    }
    case 'click': {
      const selector = args[0];
      if (!selector) return Promise.reject(new Error('Usage: click <selector>'));
      return runCommand('click', { selector });
    }
    case 'type': {
      const sel = args[0];
      const text = args.slice(1).join(' ');
      if (!sel) return Promise.reject(new Error('Usage: type <selector> <text>'));
      return runCommand('type', { selector: sel, text });
    }
    case 'evaluate': {
      const expr = args.join(' ');
      if (!expr) return Promise.reject(new Error('Usage: evaluate <expression>'));
      return runCommand('evaluate', { expression: expr });
    }
    case 'snapshot':
      return runCommand('snapshot');
    case 'extract': {
      const selector = args[0];
      if (!selector) return Promise.reject(new Error('Usage: extract <selector> [--html] [--attrs attr1,attr2]'));
      const params = { selector };
      if (args.includes('--html')) params.includeHtml = true;
      const attrsIdx = args.indexOf('--attrs');
      if (attrsIdx >= 0 && args[attrsIdx + 1]) {
        params.attrs = args[attrsIdx + 1].split(',');
      }
      return runCommand('extract', params);
    }
    case 'gethtml': {
      const selector = args[0] || 'body';
      return runCommand('gethtml', { selector });
    }
    case 'gettext': {
      const selector = args[0];
      if (!selector) return Promise.reject(new Error('Usage: gettext <selector> [--href] [--attrs attr1,attr2]'));
      const params = { selector };
      if (args.includes('--href')) params.href = true;
      const attrsIdx = args.indexOf('--attrs');
      if (attrsIdx >= 0 && args[attrsIdx + 1]) {
        params.attrs = args[attrsIdx + 1].split(',');
      }
      return runCommand('gettext', params);
    }
    case 'wait': {
      const ms = parseInt(args[0], 10) || 2000;
      return new Promise((r) => setTimeout(r, ms)).then(() => null);
    }
    default:
      return Promise.reject(new Error(`Unknown command: ${cmd}`));
  }
}

async function replMode() {
  await createServer(PORT, {
    onPageEvent(ev) {
      console.log(formatEvent(ev));
    },
    onCommandResponse(msg) {
      if (msg.success === false) {
        console.error('Error:', msg.error);
      }
      handleCommandResponse(msg);
    },
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\nimoo-browser CLI (ws://localhost:${PORT}) - Type "help" for usage, "exit" to quit.`);
  console.log('Ensure: 1) Extension loaded in Chrome  2) Open any webpage  3) Click extension icon to reconnect if needed.');
  console.log('Tip: Run `pnpm cli:daemon` in another terminal to keep WS running, then use --command for stable connections.\n');

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return;

    if (input === 'exit' || input === 'quit') {
      closeServer();
      process.exit(0);
    }

    if (input === 'help') {
      console.log(`
Commands:
  navigate <url>           Navigate to URL
  click <selector>         Click element (CSS selector)
  type <selector> <text>   Type text into input
  evaluate <expression>   Execute JS, e.g. evaluate document.title
  snapshot                Get simplified DOM tree
  wait [ms]               Wait milliseconds (default 2000)
  feedback <message>       Record capability request for agent to implement
  status                  Check extension connection
  help                    Show this help
  exit                    Quit

Single-command mode: use ; to chain, e.g. --command "navigate url ; wait 3000 ; snapshot"
Daemon mode: pnpm cli:daemon (keeps WS server running; --command then connects to it)
`);
      return;
    }

    if (input.startsWith('feedback ')) {
      const msg = input.slice(9).trim();
      if (!msg) {
        console.error('Usage: feedback <message>');
        return;
      }
      try {
        const projectRoot = resolve(__dirname, '../..');
        const file = resolve(projectRoot, 'imoo-browser-feedback.md');
        const line = `- [${new Date().toISOString()}] ${msg}\n`;
        appendFileSync(file, line);
        console.log(`Recorded: ${file}`);
      } catch (err) {
        console.error('Failed to write feedback:', err.message);
      }
      return;
    }

    if (input === 'status') {
      console.log(isConnected() ? 'Extension connected' : 'Extension not connected');
      return;
    }

    if (!isConnected()) {
      console.error('Extension not connected. Steps: 1) pnpm cli:dev  2) Load extension  3) Open a webpage  4) Click extension icon → Reconnect. (Chrome 会休眠扩展，长时间未操作后请点击扩展图标唤醒)');
      return;
    }

    try {
      const result = await parseAndRun(input);
      if (result !== undefined && result !== null && input.startsWith('evaluate ')) {
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
      } else if (result !== undefined && result !== null && input.startsWith('snapshot')) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(err?.message || err);
    }
  });
}

/** 尝试连接已有 daemon 并执行命令。成功返回 true。 */
async function connectAndRunCommands(cmdStr) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 3000);

    ws.on('open', () => {
      clearTimeout(timeout);
      const commands = cmdStr.split(';').map((s) => s.trim()).filter(Boolean);
      let idx = 0;

      function runNext() {
        if (idx >= commands.length) {
          ws.close();
          resolve(true);
          return;
        }
        const cmd = commands[idx++];
        const waitMatch = cmd.match(/^wait\s+(\d+)$/i);
        if (waitMatch) {
          setTimeout(runNext, parseInt(waitMatch[1], 10) || 2000);
          return;
        }
        const id = nextId();
        const { action, params } = parseCommandToAction(cmd);
        if (!action) {
          runNext();
          return;
        }
        const onResponse = (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
              ws.off('message', onResponse);
              if (msg.success === false && msg.error) {
                console.error(msg.error);
              } else if (msg.result !== undefined && msg.result !== null) {
                console.log(typeof msg.result === 'object' ? JSON.stringify(msg.result, null, 2) : msg.result);
              }
              runNext();
            }
          } catch {}
        };
        ws.on('message', onResponse);
        ws.send(JSON.stringify({ id, action, params }));
      }
      runNext();
    });

    ws.on('error', () => resolve(false));
  });
}

function parseCommandToAction(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  switch (action) {
    case 'navigate': {
      let url = args[0];
      if (!url) return {};
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      return { action: 'navigate', params: { url } };
    }
    case 'click':
      return args[0] ? { action: 'click', params: { selector: args[0] } } : {};
    case 'type':
      return args[0] ? { action: 'type', params: { selector: args[0], text: args.slice(1).join(' ') } } : {};
    case 'evaluate':
      return { action: 'evaluate', params: { expression: args.join(' ') } };
    case 'snapshot':
      return { action: 'snapshot', params: {} };
    case 'extract': {
      const selector = args[0];
      if (!selector) return {};
      const params = { selector };
      if (args.includes('--html')) params.includeHtml = true;
      const attrsIdx = args.indexOf('--attrs');
      if (attrsIdx >= 0 && args[attrsIdx + 1]) {
        params.attrs = args[attrsIdx + 1].split(',');
      }
      return { action: 'extract', params };
    }
    case 'gethtml':
      return { action: 'gethtml', params: { selector: args[0] || 'body' } };
    case 'gettext': {
      const selector = args[0];
      if (!selector) return {};
      const params = { selector };
      if (args.includes('--href')) params.href = true;
      const attrsIdx = args.indexOf('--attrs');
      if (attrsIdx >= 0 && args[attrsIdx + 1]) {
        params.attrs = args[attrsIdx + 1].split(',');
      }
      return { action: 'gettext', params };
    }
    default:
      return {};
  }
}

async function singleCommandMode(cmdStr) {
  const connected = await connectAndRunCommands(cmdStr);
  if (connected) return;

  await createServer(PORT, {
    onPageEvent: () => {},
    onCommandResponse: handleCommandResponse,
  });

  const deadline = Date.now() + 40000;
  while (!isConnected() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!isConnected()) {
    closeServer();
    throw new Error('Extension not connected. Open Chrome, click extension icon to reconnect.');
  }

  try {
    const commands = cmdStr.split(';').map((s) => s.trim()).filter(Boolean);
    let lastResult;
    for (const cmd of commands) {
      lastResult = await parseAndRun(cmd);
      if (lastResult !== undefined && lastResult !== null) {
        console.log(typeof lastResult === 'object' ? JSON.stringify(lastResult, null, 2) : lastResult);
      }
    }
  } catch (err) {
    closeServer();
    throw err;
  }
  closeServer();
}

async function daemonMode() {
  await createServer(PORT, { onPageEvent: () => {}, onCommandResponse: () => {} });
  console.log(`[imoo-browser] Daemon running. Use --command to send commands. Press Ctrl+C to stop.`);
  process.on('SIGINT', () => {
    closeServer();
    process.exit(0);
  });
  // Keep process alive
  await new Promise(() => {});
}

const args = process.argv.slice(2);
const cmdIndex = args.indexOf('--command');
const cmdStr = cmdIndex >= 0 ? args[cmdIndex + 1] : null;
const isDaemon = args.includes('--daemon');

if (isDaemon) {
  daemonMode().catch(console.error);
} else if (cmdStr) {
  singleCommandMode(cmdStr).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  replMode().catch(console.error);
}
