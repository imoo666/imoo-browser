/**
 * Injected script - runs in page context.
 * Intercepts console, network, errors and forwards via postMessage.
 */
(function () {
  if (window.__imooBrowserInjected) return;
  window.__imooBrowserInjected = true;

  const MESSAGE_TYPE = 'IMOO_BROWSER_FROM_PAGE';
  const MAX_BODY_SIZE = 65536; // 64KB truncation
  const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-csrf-token'];

  function send(data) {
    window.postMessage({ type: MESSAGE_TYPE, payload: data }, '*');
  }

  function safeStringify(obj) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      });
    } catch {
      return String(obj);
    }
  }

  function serializeArgs(args) {
    return Array.from(args).map((arg) => {
      if (typeof arg === 'object' && arg !== null) return safeStringify(arg);
      return String(arg);
    });
  }

  function truncate(str) {
    if (typeof str !== 'string') return str;
    if (str.length <= MAX_BODY_SIZE) return str;
    return str.slice(0, MAX_BODY_SIZE) + '\n...[truncated]';
  }

  function redactHeaders(headers) {
    if (!headers || typeof headers !== 'object') return headers;
    const result = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      result[k] = SENSITIVE_HEADERS.some((h) => lower.includes(h)) ? '[REDACTED]' : v;
    }
    return result;
  }

  // --- Console interception ---
  const levels = ['log', 'warn', 'error', 'info', 'debug'];
  const originals = {};

  levels.forEach((level) => {
    originals[level] = console[level].bind(console);
    console[level] = function (...args) {
      originals[level](...args);
      send({
        type: 'console',
        level,
        args: serializeArgs(args),
        timestamp: new Date().toISOString(),
      });
    };
  });

  // --- Error capture ---
  window.onerror = function (message, source, lineno, colno, error) {
    send({
      type: 'error',
      message: String(message),
      source: source || '',
      lineno,
      colno,
      stack: error?.stack || '',
      timestamp: new Date().toISOString(),
    });
  };

  window.addEventListener('unhandledrejection', function (event) {
    send({
      type: 'error',
      message: 'Unhandled Promise Rejection: ' + (event.reason?.message || String(event.reason)),
      stack: event.reason?.stack || '',
      timestamp: new Date().toISOString(),
    });
  });

  // --- XMLHttpRequest interception ---
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._imooData = {
      type: 'network',
      source: 'XHR',
      method: String(method).toUpperCase(),
      url: typeof url === 'string' ? url : url?.href || '',
      headers: {},
      start: performance.now(),
      timestamp: new Date().toISOString(),
    };
    return originalXhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this._imooData?.headers) {
      this._imooData.headers[key] = value;
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._imooData) {
      this._imooData.requestBody = body != null ? truncate(String(body)) : null;
    }

    const onComplete = () => {
      if (this.readyState === 4 && this._imooData) {
        this._imooData.status = this.status;
        this._imooData.duration = Math.round(performance.now() - this._imooData.start);
        this._imooData.responseBody = truncate(
          typeof this.responseText === 'string' ? this.responseText : ''
        );
        this._imooData.headers = redactHeaders(this._imooData.headers);
        send(this._imooData);
      }
    };

    this.addEventListener('readystatechange', onComplete);
    return originalXhrSend.apply(this, arguments);
  };

  // --- Fetch interception ---
  const originalFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init.method || 'GET').toUpperCase();
    const headers = init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init.headers || {});

    const fetchData = {
      type: 'network',
      source: 'Fetch',
      method,
      url,
      headers: redactHeaders(headers),
      requestBody: init.body != null ? truncate(String(init.body)) : null,
      start: performance.now(),
      timestamp: new Date().toISOString(),
    };

    return originalFetch.apply(this, arguments).then(
      (response) => {
        fetchData.status = response.status;
        fetchData.duration = Math.round(performance.now() - fetchData.start);

        const clone = response.clone();
        clone.text().then((text) => {
          fetchData.responseBody = truncate(text);
          send(fetchData);
        }).catch(() => {
          fetchData.responseBody = '[Unable to read]';
          send(fetchData);
        });

        return response;
      },
      (err) => {
        fetchData.status = 'Error';
        fetchData.duration = Math.round(performance.now() - fetchData.start);
        fetchData.responseBody = err?.message || String(err);
        send(fetchData);
        throw err;
      }
    );
  };
})();
