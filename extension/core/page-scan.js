/*
 * Best-effort reader for drafted players shown on a draft-room page. Used only
 * when ESPN's API can't be read. It looks at elements whose class names say
 * "pick"/"roster"/"draft board" and ignores the available-players table and
 * the pick queue, so queued or merely listed players are not marked drafted.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const INCLUDE = '[class*="pick" i],[class*="roster" i],[class*="draftboard" i],[class*="draft-board" i]';
  const EXCLUDE = '[class*="queue" i],[class*="available" i],[class*="player-table" i],[class*="playertable" i],table,[role="grid"],#hoops-draft-assistant';
  // "On the clock" / autopick banners mention players who are NOT drafted yet.
  const BANNER = /(autopick|on the clock|suggest|queue|would be)/i;

  /**
   * @param {Document|Element} doc
   * @param {Array<{key:string,name:string}>} players candidates not yet drafted
   * @returns {string[]} keys of players whose full name appears in a pick/roster widget
   */
  function scanDraftedNames(doc, players) {
    HDA.lastScanSawContainers = false;
    if (!doc || !doc.querySelectorAll) return [];
    const chunks = [];
    for (const el of doc.querySelectorAll(INCLUDE)) {
      if (el.closest(EXCLUDE)) continue;
      // Skip containers that wrap other matched containers to avoid huge duplicate text.
      if (el.querySelector(INCLUDE)) continue;
      const text = el.textContent || '';
      if (!text.trim() || BANNER.test(text)) continue;
      chunks.push(text);
    }
    if (!chunks.length) return [];
    HDA.lastScanSawContainers = true;
    const hay = ' ' + chunks.map((t) => HDA.normalizeName(t)).join(' | ') + ' ';
    const out = [];
    for (const p of players) {
      const n = HDA.normalizeName(p.name);
      if (n.split(' ').length < 2) continue; // single-token names are too ambiguous
      if (hay.includes(' ' + n + ' ')) out.push(p.key);
    }
    return out;
  }

  Object.assign(HDA, { scanDraftedNames, lastScanSawContainers: false });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
