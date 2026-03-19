/**
 * Puppeteer-compatible API wrapper for imoo-browser.
 * Provides standard Puppeteer API while keeping authentication advantages.
 */

import WebSocket from 'ws';
import { writeFileSync } from 'fs';

let commandId = 0;

class ImooElementHandle {
  constructor(selector, sendCommand) {
    this._selector = selector;
    this._send = sendCommand;
  }

  async click(options = {}) {
    return await this._send('click', { selector: this._selector });
  }

  async type(text, options = {}) {
    return await this._send('type', { selector: this._selector, text });
  }

  async screenshot(options = {}) {
    return await this._send('screenshot', { selector: this._selector, ...options });
  }

  async hover() {
    // TODO: implement hover via CDP
    throw new Error('hover not yet implemented');
  }

  async boundingBox() {
    const info = await this._send('getNodeInfo', { selector: this._selector });
    return info.boundingBox;
  }
}

class ImooPage {
  constructor(sendCommand) {
    this._send = sendCommand;
  }

  // Navigation
  async goto(url, options = {}) {
    await this._send('navigate', { url });
    if (options.waitUntil === 'networkidle0' || options.waitUntil === 'networkidle2') {
      // Wait for navigation complete
      await this.waitForNavigation({ timeout: options.timeout });
    }
    return { ok: true };
  }

  async waitForNavigation(options = {}) {
    return await this._send('waitForNavigation', { timeout: options.timeout || 30000 });
  }

  async reload(options = {}) {
    const url = await this.url();
    return await this.goto(url, options);
  }

  async goBack(options = {}) {
    await this.evaluate(() => window.history.back());
    return { ok: true };
  }

  async goForward(options = {}) {
    await this.evaluate(() => window.history.forward());
    return { ok: true };
  }

  // Selectors
  async $(selector) {
    try {
      await this._send('querySelector', { selector });
      return new ImooElementHandle(selector, this._send.bind(this));
    } catch {
      return null;
    }
  }

  async $$(selector) {
    const { nodeIds } = await this._send('querySelectorAll', { selector });
    return nodeIds.map((_, i) => new ImooElementHandle(`${selector}:nth-of-type(${i + 1})`, this._send.bind(this)));
  }

  async $eval(selector, pageFunction, ...args) {
    const funcStr = pageFunction.toString();
    return await this.evaluate(`(${funcStr})(document.querySelector('${selector}'), ${JSON.stringify(args)})`);
  }

  async $$eval(selector, pageFunction, ...args) {
    const funcStr = pageFunction.toString();
    return await this.evaluate(`(${funcStr})(document.querySelectorAll('${selector}'), ${JSON.stringify(args)})`);
  }

  async waitForSelector(selector, options = {}) {
    return await this._send('waitForSelector', { selector, timeout: options.timeout || 30000 });
  }

  async waitForTimeout(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  async waitForFunction(pageFunction, options = {}, ...args) {
    const timeout = options.timeout || 30000;
    const startTime = Date.now();
    const funcStr = pageFunction.toString();

    while (Date.now() - startTime < timeout) {
      const result = await this.evaluate(`(${funcStr})(${args.map(a => JSON.stringify(a)).join(',')})`);
      if (result) return result;
      await this.waitForTimeout(options.polling || 100);
    }

    throw new Error('waitForFunction timeout');
  }

  // Actions
  async click(selector, options = {}) {
    return await this._send('click', { selector });
  }

  async type(selector, text, options = {}) {
    return await this._send('type', { selector, text });
  }

  async focus(selector) {
    return await this.evaluate(`document.querySelector('${selector}').focus()`);
  }

  async hover(selector) {
    // TODO: implement via CDP mouse events
    throw new Error('hover not yet implemented');
  }

  async select(selector, ...values) {
    return await this.evaluate(`
      const el = document.querySelector('${selector}');
      const options = Array.from(el.options);
      const valuesToSelect = ${JSON.stringify(values)};
      options.forEach(opt => {
        opt.selected = valuesToSelect.includes(opt.value);
      });
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return valuesToSelect;
    `);
  }

  async tap(selector) {
    return await this.click(selector);
  }

  // Evaluation
  async evaluate(pageFunction, ...args) {
    let expression;
    if (typeof pageFunction === 'string') {
      expression = pageFunction;
    } else {
      const funcStr = pageFunction.toString();
      expression = `(${funcStr})(${args.map(a => JSON.stringify(a)).join(',')})`;
    }
    return await this._send('evaluate', { expression });
  }

  async evaluateHandle(pageFunction, ...args) {
    const result = await this.evaluate(pageFunction, ...args);
    return { jsonValue: async () => result };
  }

  // Content
  async content() {
    return await this._send('content');
  }

  async title() {
    return await this._send('title');
  }

  async url() {
    return await this._send('url');
  }

  // Screenshots & PDFs
  async screenshot(options = {}) {
    const { data } = await this._send('screenshot', {
      fullPage: options.fullPage,
      encoding: options.encoding || 'binary',
      selector: options.clip?.selector
    });

    if (options.path) {
      const buffer = Buffer.from(data, 'base64');
      writeFileSync(options.path, buffer);
      return buffer;
    }

    return options.encoding === 'base64' ? data : Buffer.from(data, 'base64');
  }

  async pdf(options = {}) {
    const { data } = await this._send('pdf', { options });

    if (options.path) {
      const buffer = Buffer.from(data, 'base64');
      writeFileSync(options.path, buffer);
      return buffer;
    }

    return Buffer.from(data, 'base64');
  }

  // Cookies
  async cookies(...urls) {
    return await this._send('getCookies', { urls: urls.length > 0 ? urls : undefined });
  }

  async setCookie(...cookies) {
    return await this._send('setCookies', { cookies });
  }

  async deleteCookie(...cookies) {
    return await this._send('deleteCookies', { cookies });
  }

  // Viewport
  async setViewport(viewport) {
    return await this._send('setViewport', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: viewport.isMobile
    });
  }

  async viewport() {
    return await this.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio
    }));
  }

  // Emulation
  async emulate(options) {
    if (options.viewport) {
      await this.setViewport(options.viewport);
    }
    if (options.userAgent) {
      await this.setUserAgent(options.userAgent);
    }
  }

  async setUserAgent(userAgent) {
    return await this._send('setUserAgent', { userAgent });
  }

  // Scrolling
  async evaluate(expression) {
    return await this._send('evaluate', { expression });
  }

  // Coverage, Tracing, Metrics (stubs for compatibility)
  get coverage() {
    return {
      startJSCoverage: async () => {},
      stopJSCoverage: async () => [],
      startCSSCoverage: async () => {},
      stopCSSCoverage: async () => []
    };
  }

  get tracing() {
    return {
      start: async () => {},
      stop: async () => Buffer.from('')
    };
  }

  async metrics() {
    return await this.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0];
      return {
        Timestamp: Date.now() / 1000,
        Documents: document.getElementsByTagName('*').length,
        JSHeapUsedSize: performance.memory?.usedJSHeapSize || 0,
        JSHeapTotalSize: performance.memory?.totalJSHeapSize || 0
      };
    });
  }
}

class ImooBrowser {
  constructor(ws) {
    this._ws = ws;
    this._commandHandlers = new Map();
    this._page = new ImooPage(this._sendCommand.bind(this));

    this._ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id && this._commandHandlers.has(msg.id)) {
          const handler = this._commandHandlers.get(msg.id);
          this._commandHandlers.delete(msg.id);

          if (msg.success) {
            handler.resolve(msg.result);
          } else {
            handler.reject(new Error(msg.error || 'Command failed'));
          }
        }
      } catch {}
    });
  }

  async pages() {
    return [this._page];
  }

  async newPage() {
    // For now, return the same page (single tab mode)
    return this._page;
  }

  async close() {
    this._ws.close();
  }

  async _sendCommand(action, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `cmd-${++commandId}`;
      this._commandHandlers.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this._commandHandlers.delete(id);
        reject(new Error(`Command timeout: ${action}`));
      }, 60000);

      this._commandHandlers.get(id).timeout = timeout;

      this._ws.send(JSON.stringify({ id, action, params }), (err) => {
        if (err) {
          clearTimeout(timeout);
          this._commandHandlers.delete(id);
          reject(err);
        }
      });
    }).finally(() => {
      const handler = this._commandHandlers.get(`cmd-${commandId}`);
      if (handler?.timeout) clearTimeout(handler.timeout);
    });
  }
}

/**
 * Connect to imoo-browser extension.
 * Returns a Puppeteer-compatible Browser instance.
 */
export async function connect(options = {}) {
  const port = options.port || 53421;
  const ws = new WebSocket(`ws://localhost:${port}`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout. Ensure extension is loaded and server is running.'));
    }, options.timeout || 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return new ImooBrowser(ws);
}

/**
 * Launch is not supported - imoo-browser connects to existing Chrome.
 */
export function launch() {
  throw new Error('launch() is not supported. Use connect() to attach to existing Chrome with extension.');
}

export default { connect, launch };
