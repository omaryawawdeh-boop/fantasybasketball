/*
 * Editing your rankings: pure functions over the list ({rank, name, tier, ...})
 * and its tier labels. Every function returns a NEW {players, tierLabels};
 * ranks are renumbered and tiers kept in order (1, 2, 3... with no gaps).
 * Players are addressed by their current rank (1-based).
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const clone = (players) => players.map((p) => ({ ...p }));

  /** Renumber ranks, force tiers to never decrease down the list, and close gaps (1,2,4 -> 1,2,3). */
  function normalize(players, tierLabels = {}) {
    const out = clone(players);
    let prev = out.length ? out[0].tier || 1 : 1;
    for (const p of out) {
      if (p.tier == null || p.tier < prev) p.tier = prev;
      prev = p.tier;
    }
    const used = [...new Set(out.map((p) => p.tier))].sort((a, b) => a - b);
    const remap = new Map(used.map((t, i) => [t, i + 1]));
    const labels = {};
    for (const [t, n] of remap) if (tierLabels[t]) labels[n] = tierLabels[t];
    out.forEach((p, i) => { p.rank = i + 1; p.tier = remap.get(p.tier); });
    return { players: out, tierLabels: labels };
  }

  /** Move the player at `from` to `to`. He keeps his tier unless that would break tier order, then joins the tier he landed in. */
  function moveTo(players, tierLabels, from, to) {
    const arr = clone(players);
    if (from < 1 || from > arr.length) return { players, tierLabels };
    to = Math.max(1, Math.min(arr.length, to));
    if (to === from) return { players, tierLabels };
    const [p] = arr.splice(from - 1, 1);
    arr.splice(to - 1, 0, p);
    const above = arr[to - 2];
    const below = arr[to];
    const lo = above ? above.tier : -Infinity;
    const hi = below ? below.tier : Infinity;
    p.tier = Math.min(Math.max(p.tier, lo), hi);
    return normalize(arr, tierLabels);
  }

  const moveBy = (players, tierLabels, rank, delta) => moveTo(players, tierLabels, rank, rank + delta);

  /** Move a player into the tier above (as its last player) or below (as its first). */
  function changeTier(players, tierLabels, rank, dir) {
    const arr = clone(players);
    const p = arr[rank - 1];
    if (!p) return { players, tierLabels };
    const rest = arr.filter((_, i) => i !== rank - 1);
    const target = p.tier + (dir < 0 ? -1 : 1);
    if (target < 1) return { players, tierLabels };
    let at;
    if (dir < 0) {
      let last = -1;
      rest.forEach((x, i) => { if (x.tier === target) last = i; });
      if (last < 0) return { players, tierLabels };
      at = last + 1;
    } else {
      at = rest.findIndex((x) => x.tier === target);
      if (at < 0) at = rest.length; // no tier below yet: he starts a new last tier
    }
    rest.splice(at, 0, { ...p, tier: target });
    return normalize(rest, tierLabels);
  }

  /** Start a new tier at this player: he and everyone after him in his tier move down a tier. */
  function splitTier(players, tierLabels, rank) {
    const arr = clone(players);
    const p = arr[rank - 1];
    if (!p) return { players, tierLabels };
    const t = p.tier;
    if (rank === 1 || arr[rank - 2].tier !== t) return { players, tierLabels }; // already starts a tier
    const labels = {};
    for (const [k, v] of Object.entries(tierLabels || {})) labels[Number(k) > t ? Number(k) + 1 : k] = v;
    arr.forEach((x, i) => {
      if (x.tier > t) x.tier += 1;
      else if (x.tier === t && i >= rank - 1) x.tier = t + 1;
    });
    return normalize(arr, labels);
  }

  /** Merge a tier into the one above it. */
  function mergeTier(players, tierLabels, tier) {
    if (tier <= 1) return { players, tierLabels };
    const arr = clone(players).map((x) => ({ ...x, tier: x.tier >= tier ? x.tier - 1 : x.tier }));
    const labels = {};
    for (const [k, v] of Object.entries(tierLabels || {})) {
      const n = Number(k);
      if (n === tier) continue;
      labels[n > tier ? n - 1 : n] = v;
    }
    return normalize(arr, labels);
  }

  /** Drop a player at the top of a tier (used when dragging onto a tier header). */
  function moveToTierStart(players, tierLabels, rank, tier) {
    const p = players[rank - 1];
    if (!p) return { players, tierLabels };
    const rest = clone(players).filter((_, i) => i !== rank - 1);
    let at = rest.findIndex((x) => x.tier >= tier);
    if (at < 0) at = rest.length;
    rest.splice(at, 0, { ...p, tier });
    return normalize(rest, tierLabels);
  }

  function toggleFlag(players, tierLabels, rank, flag) {
    const arr = clone(players);
    const p = arr[rank - 1];
    if (!p || !['dontReach', 'injuryProne'].includes(flag)) return { players, tierLabels };
    if (p[flag]) delete p[flag];
    else p[flag] = true;
    return { players: arr, tierLabels };
  }

  function removeAt(players, tierLabels, rank) {
    return normalize(players.filter((_, i) => i !== rank - 1), tierLabels);
  }

  /** Add a player (not already on the list) at `rank` (default: the bottom). He joins the tier he lands in. */
  function insertAt(players, tierLabels, entry, rank) {
    const norm = HDA.normalizeName(entry.name);
    if (players.some((p) => HDA.normalizeName(p.name) === norm)) return { players, tierLabels };
    const arr = clone(players);
    const at = rank == null ? arr.length : Math.max(0, Math.min(arr.length, rank - 1));
    const above = arr[at - 1];
    const below = arr[at];
    const p = { name: entry.name, team: entry.team || null, pos: entry.pos || [], tier: above ? above.tier : below ? below.tier : 1 };
    arr.splice(at, 0, p);
    return normalize(arr, tierLabels);
  }

  /** Add a player just before `anchorName` (same tier as the anchor); at the bottom if the anchor is missing. */
  function insertBefore(players, tierLabels, entry, anchorName) {
    const norm = HDA.normalizeName(entry.name);
    if (players.some((p) => HDA.normalizeName(p.name) === norm)) return { players, tierLabels };
    const arr = clone(players);
    const at = arr.findIndex((p) => HDA.normalizeName(p.name) === HDA.normalizeName(anchorName));
    const idx = at < 0 ? arr.length : at;
    const tier = at < 0 ? (arr.length ? arr[arr.length - 1].tier : 1) : arr[at].tier;
    const p = { name: entry.name, team: entry.team || null, pos: entry.pos || [], tier };
    for (const k of ['rookie', 'injuryProne', 'dontReach', 'note']) if (entry[k]) p[k] = entry[k];
    arr.splice(idx, 0, p);
    return normalize(arr, tierLabels);
  }

  function renameTier(players, tierLabels, tier, label) {
    const labels = { ...(tierLabels || {}) };
    if (label && label.trim()) labels[tier] = label.trim();
    else delete labels[tier];
    return { players, tierLabels: labels };
  }

  HDA.rankEdit = { insertBefore, normalize, moveTo, moveBy, moveToTierStart, changeTier, splitTier, mergeTier, toggleFlag, removeAt, insertAt, renameTier };
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
