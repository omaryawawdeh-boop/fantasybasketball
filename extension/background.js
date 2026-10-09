// Service worker: proxies ESPN read requests (fallback when page CORS blocks the
// content script) and opens extension pages.
const ALLOWED_HOSTS = new Set(['lm-api-reads.fantasy.espn.com', 'fantasy.espn.com']);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'hda-fetch') {
    let url;
    try { url = new URL(msg.url); } catch (e) { sendResponse({ ok: false, error: 'bad url' }); return false; }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      sendResponse({ ok: false, error: 'host not allowed' });
      return false;
    }
    fetch(url.href, { credentials: 'include', headers: msg.headers || {} })
      .then(async (r) => {
        if (!r.ok) return sendResponse({ ok: false, status: r.status, error: `ESPN returned ${r.status}` });
        sendResponse({ ok: true, json: await r.json() });
      })
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // async response
  }
  if (msg && msg.type === 'hda-open') {
    const page = msg.page === 'board' ? 'standalone/board.html' : 'options/options.html';
    chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  }
  return false;
});
