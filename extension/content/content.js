/**
 * Content script - bridges page context and extension.
 * Injects injected.js and forwards messages to background.
 */

(function () {
  // Inject the monitoring script into the page
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Listen for messages from the injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data?.type || event.data.type !== 'IMOO_BROWSER_FROM_PAGE') {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'PAGE_EVENT',
      payload: event.data.payload,
    });
  });

  // Handle commands from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'EXECUTE_COMMAND') return;

    const { action, params } = message;
    let result;

    try {
      switch (action) {
        case 'click': {
          const el = document.querySelector(params.selector);
          if (!el) {
            sendResponse({ success: false, error: `Element not found: ${params.selector}` });
            return true;
          }
          el.click();
          result = { clicked: true };
          break;
        }
        case 'type': {
          const el = document.querySelector(params.selector);
          if (!el) {
            sendResponse({ success: false, error: `Element not found: ${params.selector}` });
            return true;
          }
          el.focus();
          el.value = params.text ?? '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          result = { typed: true };
          break;
        }
        case 'evaluate': {
          const fn = new Function(`return (${params.expression})`);
          result = fn();
          result = typeof result === 'object' && result !== null
            ? JSON.parse(JSON.stringify(result))
            : result;
          break;
        }
        case 'snapshot': {
          result = getSimplifiedSnapshot();
          break;
        }
        case 'extract': {
          const elements = document.querySelectorAll(params.selector);
          result = Array.from(elements).map(el => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            text: el.textContent?.trim() || '',
            html: params.includeHtml ? el.innerHTML : undefined,
            attrs: params.attrs ? Object.fromEntries(
              params.attrs.map(attr => [attr, el.getAttribute(attr)])
            ) : undefined
          }));
          break;
        }
        case 'gethtml': {
          const selector = params.selector || 'body';
          const el = document.querySelector(selector);
          if (!el) {
            sendResponse({ success: false, error: `Element not found: ${selector}` });
            return true;
          }
          result = { html: el.outerHTML };
          break;
        }
        case 'gettext': {
          const selector = params.selector;
          if (!selector) {
            sendResponse({ success: false, error: 'selector is required' });
            return true;
          }
          const elements = document.querySelectorAll(selector);
          result = Array.from(elements).map((el, index) => {
            const obj = { index, text: el.textContent?.trim() || '' };
            if (params.href && el.tagName.toLowerCase() === 'a') {
              obj.href = el.href;
            }
            if (params.attrs) {
              obj.attrs = {};
              params.attrs.forEach(attr => {
                const value = el.getAttribute(attr);
                if (value) obj.attrs[attr] = value;
              });
            }
            return obj;
          });
          break;
        }
        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
          return true;
      }
      sendResponse({ success: true, result });
    } catch (err) {
      sendResponse({ success: false, error: err?.message || String(err) });
    }
    return true;
  });

  function getSimplifiedSnapshot() {
    const walk = (node, depth = 0) => {
      if (depth > 10) return null;
      const tag = node.tagName?.toLowerCase();
      if (!tag || tag === 'script' || tag === 'style') return null;

      const obj = {
        tag,
        id: node.id || undefined,
        classes: node.className && typeof node.className === 'string'
          ? node.className.split(/\s+/).filter(Boolean)
          : undefined,
        text: node.childNodes?.length === 1 && node.childNodes[0].nodeType === 3
          ? node.childNodes[0].textContent?.trim().slice(0, 100)
          : undefined,
        attrs: {},
        children: [],
      };

      if (node.attributes) {
        for (const a of node.attributes) {
          if (['id', 'class'].includes(a.name)) continue;
          if (['data-testid', 'data-test', 'name', 'placeholder', 'aria-label'].includes(a.name)) {
            obj.attrs[a.name] = a.value;
          }
        }
      }

      for (const child of node.childNodes || []) {
        if (child.nodeType !== 1) continue;
        const childObj = walk(child, depth + 1);
        if (childObj) obj.children.push(childObj);
      }

      return obj;
    };

    return walk(document.body) || { tag: 'body', children: [] };
  }
})();
