// shared utilities
function makeRoomCode() {
  // 6 char alphanumeric
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function wsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

function copyToClipboard(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  document.execCommand('copy');
  t.remove();
  return Promise.resolve();
}

function getParam(name) {
  const params = new URLSearchParams(location.search);
  return params.get(name);
}
