/**
 * Content script - minimal monitoring only.
 * Most commands now use CDP directly via background.js.
 * This script is kept only for injected.js monitoring capabilities.
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
})();
