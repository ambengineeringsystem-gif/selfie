// shared utilities
function makeRoomCode() {
  // 6 char alphanumeric
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function wsUrl() {
  // If a signaling server URL is provided via ?signal=, use it (allows hosting static site on GitHub Pages)
  const param = getParam('signal');
  if (param) {
    // allow passing either wss://... or https://... or host only; prefer given value
    if (param.startsWith('ws://') || param.startsWith('wss://')) return param;
    if (param.startsWith('http://') || param.startsWith('https://')) {
      return (param.startsWith('https://') ? 'wss://' : 'ws://') + param.replace(/^https?:\/\//, '') + '/ws';
    }
    // otherwise treat as host
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${param}/ws`;
  }

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
