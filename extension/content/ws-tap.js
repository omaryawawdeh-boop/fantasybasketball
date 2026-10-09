/*
 * Runs in the PAGE's own JavaScript world at document_start, before ESPN's draft
 * room opens its live connection. It wraps window.WebSocket so the extension
 * can see the same pick messages the draft room receives, and forwards copies
 * of incoming text frames to the extension's content script via postMessage.
 * It never sends anything, never changes messages, and only listens.
 */
(function () {
  if (window.__hdaTap) return;
  window.__hdaTap = true;
  if (window.top === window && !/\/draft/.test(location.pathname)) return;
  const Orig = window.WebSocket;
  if (!Orig) return;
  const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  function forward(url, data) {
    try {
      let text = null;
      if (typeof data === 'string') text = data;
      else if (dec && data instanceof ArrayBuffer && data.byteLength < 200000) text = dec.decode(data);
      if (text == null) return;
      window.top.postMessage({ __hda: 'ws', url: String(url).slice(0, 200), data: text.slice(0, 20000) }, '*');
    } catch (e) { /* never break ESPN */ }
  }

  function Tapped(url, protocols) {
    const ws = protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
    try {
      ws.addEventListener('message', (ev) => {
        if (ev.data instanceof Blob) ev.data.text().then((t) => forward(url, t)).catch(() => {});
        else forward(url, ev.data);
      });
    } catch (e) { /* ignore */ }
    return ws;
  }
  Tapped.prototype = Orig.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Tapped[k] = Orig[k];
  window.WebSocket = Tapped;
})();
