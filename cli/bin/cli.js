#!/usr/bin/env node

/**
 * imoo-browser CLI entry.
 * Usage: node cli.js                    - start server (WebSocket server)
 *        node cli.js --command "..."    - send command to server
 */

import { createServer, closeServer } from '../src/server.js';
import WebSocket from 'ws';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 53421;
const portIndex = process.argv.indexOf('--port');
const PORT = portIndex >= 0 && process.argv[portIndex + 1]
  ? parseInt(process.argv[portIndex + 1], 10)
  : DEFAULT_PORT;
let commandId = 0;

function nextId() {
  return `cmd-${++commandId}`;
}

/** 连接 server 并执行命令 */
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

async function commandMode(cmdStr) {
  const connected = await connectAndRunCommands(cmdStr);
  if (!connected) {
    throw new Error('Failed to connect to server. Please ensure server is running: pnpm cli');
  }
}

async function serverMode() {
  await createServer(PORT, { onPageEvent: () => {}, onCommandResponse: () => {} });
  console.log(`[imoo-browser] Server running on ws://localhost:${PORT}`);
  console.log(`Send commands with: node cli/bin/cli.js --command "navigate https://example.com"`);
  console.log(`Press Ctrl+C to stop.\n`);
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeServer();
    process.exit(0);
  });
  // Keep process alive
  await new Promise(() => {});
}

const args = process.argv.slice(2);
const cmdIndex = args.indexOf('--command');
const cmdStr = cmdIndex >= 0 ? args[cmdIndex + 1] : null;

if (cmdStr) {
  // Command mode: connect to server and execute
  commandMode(cmdStr).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  // Default: start server
  serverMode().catch(console.error);
}
