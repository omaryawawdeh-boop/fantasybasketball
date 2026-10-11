/*
 * Reads drafted players off a draft-room page: the pick carousel, pick history,
 * draft board and rosters. Runs alongside the live feed and ESPN's league
 * data. It skips anything that looks like the available-players list (rows
 * with DRAFT/QUEUE buttons), the pick queue, and "your autopick would be..."
 * banners, so players who are merely listed are never crossed off.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const INCLUDE = '[class*="pick" i],[class*="board" i],[class*="history" i],[class*="roster" i],[class*="selected" i],[class*="drafted" i],[class*="activity" i]';
  const EXCLUDE = '[class*="queue" i],[class*="available" i],[class*="suggest" i],#hoops-draft-assistant';
  const BANNER = /(autopick|would be|on the clock|suggested|your queue)/i;
  const ACTION_BTN = /^\s*(draft|queue|\+|add|select)\s*$/i;

  function hasActionButton(el) {
    for (const b of el.querySelectorAll('button,a[role="button"],[class*="btn" i]')) {
      if (ACTION_BTN.test(b.textContent || '')) return true;
    }
    return false;
  }

  /** Name forms a draft room may print: "Nikola Jokic", "N. Jokic", and "Jokic" in a small pick cell. */
  function nameForms(players) {
    const initialCount = new Map();
    const lastCount = new Map();
    const rows = [];
    for (const p of players) {
      const full = HDA.normalizeName(p.name);
      const toks = full.split(' ');
      if (toks.length < 2) continue;
      const initial = toks[0][0] + ' ' + toks.slice(1).join(' ');
      const last = toks.slice(1).join(' ');
      initialCount.set(initial, (initialCount.get(initial) || 0) + 1);
      lastCount.set(last, (lastCount.get(last) || 0) + 1);
      rows.push({ key: p.key, full, initial, last });
    }
    // "J. Williams" / "Williams" could be several players -> only trust unambiguous short forms.
    return rows.map((r) => ({
      ...r,
      initial: initialCount.get(r.initial) === 1 && r.initial.length >= 6 ? r.initial : null,
      last: lastCount.get(r.last) === 1 && r.last.length >= 5 ? r.last : null,
    }));
  }

  const SMALL_CELL = 60; // a pick-bar cell, not a paragraph

  /**
   * @param {Document|Element} doc
   * @param {Array<{key:string,name:string}>} players  the whole player pool (for ambiguity checks)
   * @returns {string[]} keys of players shown as drafted
   */
  function scanDraftedNames(doc, players) {
    HDA.lastScanSawContainers = false;
    HDA.lastScanInfo = { containers: 0, classes: [] };
    if (!doc || !doc.querySelectorAll) return [];
    const chunks = [];
    const classes = new Set();
    for (const el of doc.querySelectorAll(INCLUDE)) {
      if (el.closest(EXCLUDE)) continue;
      if (el.querySelector(INCLUDE)) continue; // innermost containers only
      const text = el.textContent || '';
      if (!text.trim() || text.length > 20000 || BANNER.test(text)) continue;
      if (hasActionButton(el)) continue;
      chunks.push(text);
      if (classes.size < 25) classes.add(String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className).slice(0, 60));
    }
    HDA.lastScanInfo = { containers: chunks.length, classes: [...classes] };
    if (!chunks.length) return [];
    HDA.lastScanSawContainers = true;
    const hay = ' ' + chunks.map((t) => HDA.normalizeName(t)).join(' | ') + ' ';
    const small = ' ' + chunks.filter((t) => t.trim().length <= SMALL_CELL).map((t) => HDA.normalizeName(t)).join(' | ') + ' ';
    const out = [];
    for (const f of nameForms(players)) {
      if (hay.includes(' ' + f.full + ' ') || (f.initial && hay.includes(' ' + f.initial + ' ')) || (f.last && small.includes(' ' + f.last + ' '))) out.push(f.key);
    }
    return out;
  }

  /**
   * Diagnostics: where on the page do player names appear? Lists the class
   * chain around each sighting so the reader can be aimed at the right widget.
   */
  function nameSightings(doc, players, limit = 30) {
    if (!doc || !doc.createTreeWalker) return [];
    const forms = nameForms(players.slice(0, 250));
    const out = [];
    const walker = doc.createTreeWalker(doc.body || doc, 4 /* NodeFilter.SHOW_TEXT */);
    let node;
    while ((node = walker.nextNode()) && out.length < limit) {
      const t = node.nodeValue;
      if (!t || t.trim().length < 4) continue;
      const n = ' ' + HDA.normalizeName(t) + ' ';
      const hit = forms.find((f) => n.includes(' ' + f.full + ' ') || (f.initial && n.includes(' ' + f.initial + ' ')) || (f.last && t.trim().length <= SMALL_CELL && n.includes(' ' + f.last + ' ')));
      if (!hit) continue;
      const chain = [];
      for (let el = node.parentElement, i = 0; el && i < 6; el = el.parentElement, i++) {
        chain.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`);
      }
      out.push({ text: t.trim().slice(0, 60), chain: chain.join(' < ') });
    }
    return out;
  }

  Object.assign(HDA, { scanDraftedNames, nameSightings, lastScanSawContainers: false, lastScanInfo: null });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
