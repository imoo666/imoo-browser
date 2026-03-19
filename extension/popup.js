const statusEl = document.getElementById('status');
const btn = document.getElementById('reconnect');

chrome.runtime.sendMessage('STATUS', (res) => {
  if (res?.connected) {
    statusEl.textContent = '已连接 CLI';
    statusEl.className = 'status connected';
  } else {
    statusEl.textContent = '未连接';
    statusEl.className = 'status disconnected';
  }
});

btn.onclick = () => {
  btn.disabled = true;
  chrome.runtime.sendMessage('RECONNECT', () => {
    setTimeout(() => {
      chrome.runtime.sendMessage('STATUS', (res) => {
        statusEl.textContent = res?.connected ? '已连接 CLI' : '未连接';
        statusEl.className = 'status ' + (res?.connected ? 'connected' : 'disconnected');
        btn.disabled = false;
      });
    }, 500);
  });
};
