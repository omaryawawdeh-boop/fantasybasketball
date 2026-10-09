/*
 * Pull draft picks out of live draft-room messages. ESPN doesn't document its
 * draft feed, so this accepts the shapes such feeds use:
 *   - text commands like "SELECTED <teamId> <playerId> ..." (one per line)
 *   - JSON anywhere in the frame with a playerId plus a pick/team marker
 * Anything ambiguous is ignored; only ids present in the player pool count.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const TEXT_RE = /\b(?:SELECTED|SELECT|PICK(?:ED)?|DRAFTED)\s+(\d{1,2})\s+(-?\d{3,9})\b/g;
  // Messages about queues/suggestions/autopick previews are not picks.
  const NOT_A_PICK = /\b(AUTOSUGGEST|SUGGEST|QUEUE|AUTODRAFT_PREVIEW|RANK)/i;

  function parseLiveFrame(text, knownIds) {
    const out = [];
    if (!text || typeof text !== 'string') return out;
    const ok = (id) => id > 0 && (!knownIds || knownIds.has(id));

    for (const line of text.split(/\r?\n/)) {
      if (NOT_A_PICK.test(line)) continue;
      TEXT_RE.lastIndex = 0;
      let m;
      while ((m = TEXT_RE.exec(line))) {
        const teamId = Number(m[1]);
        const espnId = Number(m[2]);
        if (ok(espnId)) out.push({ teamId, espnId, overall: null, source: 'live' });
      }
    }

    const t = text.trim();
    if ((t[0] === '{' || t[0] === '[') && !NOT_A_PICK.test(t.slice(0, 200))) {
      try { walk(JSON.parse(t), out, ok, 0); } catch (e) { /* not JSON */ }
    }
    // Same player reported twice in one frame -> keep the first.
    const seen = new Set();
    return out.filter((p) => (seen.has(p.espnId) ? false : (seen.add(p.espnId), true)));
  }

  function walk(node, out, ok, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, out, ok, depth + 1); return; }
    const pid = Number(node.playerId ?? node.playerID);
    const isPick = node.overallPickNumber != null || node.pickNumber != null || node.selectingTeamId != null
      || (node.teamId != null && (node.roundId != null || node.round != null));
    if (isPick && ok(pid)) {
      out.push({
        teamId: node.teamId ?? node.selectingTeamId ?? null,
        espnId: pid,
        overall: Number(node.overallPickNumber ?? node.pickNumber) || null,
        source: 'live',
      });
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, out, ok, depth + 1);
  }

  Object.assign(HDA, { parseLiveFrame });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
