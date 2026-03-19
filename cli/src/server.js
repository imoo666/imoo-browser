/**
 * WebSocket server - receives connection from extension and relays commands.
 * Supports: extension (first connection), controller (subsequent, e.g. single-command mode).
 */

import { WebSocketServer } from 'ws';

const DEFAULT_PORT = 53421;

let wss = null;
let extensionClient = null;
let eventHandlers = null;
/** @type {Map<string, import('ws').WebSocket>} - command id -> controller ws */
const pendingControllerCommands = new Map();

export function createServer(port = DEFAULT_PORT, onEvent) {
  eventHandlers = onEvent;
  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({ port }, () => {
      console.log(`[imoo-browser] WebSocket server listening on ws://localhost:${port}`);
      resolve(wss);
    });

    wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. Kill the process: lsof -i :${port} then kill <PID>`
        ));
      } else {
        reject(err);
      }
    });

    wss.on('connection', (ws) => {
      let role = null; // 'extension' | 'controller'

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Identify role on first message: controller sends { id, action, params }, extension sends PING/response/event
          if (!role) {
            const looksLikeCommand = msg?.id && msg?.action != null && !('success' in msg);
            role = looksLikeCommand ? 'controller' : 'extension';
            if (role === 'extension') {
              extensionClient = ws;
              console.log('[imoo-browser] Extension connected');
            }
          }

          if (role === 'extension') {
            if (msg?.type === 'PING') return;

            if ('success' in msg && 'id' in msg) {
              const controller = pendingControllerCommands.get(msg.id);
              if (controller?.readyState === 1) {
                pendingControllerCommands.delete(msg.id);
                controller.send(JSON.stringify(msg));
              }
              if (eventHandlers?.onCommandResponse) {
                eventHandlers.onCommandResponse(msg);
              }
              return;
            }

            if (msg.type) {
              if (eventHandlers?.onPageEvent) {
                eventHandlers.onPageEvent(msg);
              }
            }
          } else {
            if (msg?.id && msg?.action != null) {
              pendingControllerCommands.set(msg.id, ws);
              if (extensionClient?.readyState === 1) {
                extensionClient.send(JSON.stringify({ id: msg.id, action: msg.action, params: msg.params || {} }));
              } else {
                pendingControllerCommands.delete(msg.id);
                ws.send(JSON.stringify({ id: msg.id, success: false, error: 'Extension not connected' }));
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      });

      ws.on('close', () => {
        if (role === 'extension') {
          extensionClient = null;
          console.log('[imoo-browser] Extension disconnected');
          for (const [id, ctrl] of pendingControllerCommands) {
            if (ctrl?.readyState === 1) {
              ctrl.send(JSON.stringify({ id, success: false, error: 'Extension disconnected' }));
            }
          }
          pendingControllerCommands.clear();
        } else if (role === 'controller') {
          for (const [id, ctrl] of pendingControllerCommands) {
            if (ctrl === ws) pendingControllerCommands.delete(id);
          }
        }
      });
    });
  });
}

export function sendCommand(command) {
  if (!extensionClient || extensionClient.readyState !== 1) {
    return Promise.reject(new Error('Extension not connected'));
  }
  extensionClient.send(JSON.stringify(command));
  return Promise.resolve();
}

export function isConnected() {
  return extensionClient?.readyState === 1;
}

export function closeServer() {
  if (wss) {
    wss.close();
    wss = null;
  }
  extensionClient = null;
}
