/*
 * Player-name normalization and matching.
 *
 * Names are only a fallback identity: when ESPN data is available every
 * player is keyed by ESPN player id. Names are used to line up a user's
 * pasted tier list with ESPN's player pool.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

  // Common short names -> the name ESPN uses. Keys and values are normalized.
  const ALIASES = {
    'nic claxton': 'nicolas claxton',
    'herb jones': 'herbert jones',
    'cam johnson': 'cameron johnson',
    'cam thomas': 'cameron thomas',
    'bub carrington': 'carlton carrington',
    'og anunoby': 'og anunoby',
    'pj washington': 'pj washington',
    'kj martin': 'kenyon martin',
    'moe wagner': 'moritz wagner',
    'nah shon hyland': 'bones hyland',
    'nahshon hyland': 'bones hyland',
    'alex sarr': 'alexandre sarr',
    'jabari smith': 'jabari smith',
    'ron holland': 'ronald holland',
    'jimmy butler': 'jimmy butler',
    'kelly oubre': 'kelly oubre',
    'tim hardaway': 'tim hardaway',
    'mo bamba': 'mohamed bamba',
    'sga': 'shai gilgeous alexander',
    'jjj': 'jaren jackson',
    'kat': 'karl anthony towns',
  };

  function normalizeName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[.'’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((t, i) => t && !(i > 0 && SUFFIXES.has(t)))
      .join(' ');
  }

  function playerKey(p) {
    if (p.espnId != null) return 'e' + p.espnId;
    return 'n:' + normalizeName(p.name);
  }

  /** Build a lookup index over a player pool ({name, ...}). */
  function buildNameIndex(players) {
    const exact = new Map();
    const lastInitial = new Map();
    for (const p of players) {
      const norm = normalizeName(p.name);
      if (!norm) continue;
      push(exact, norm, p);
      const toks = norm.split(' ');
      if (toks.length >= 2) push(lastInitial, toks[toks.length - 1] + '|' + toks[0][0], p);
    }
    return { exact, lastInitial };
  }

  function push(map, k, v) {
    const arr = map.get(k);
    if (arr) arr.push(v);
    else map.set(k, [v]);
  }

  /**
   * Find the pool player for a free-text name. Returns {player, method} or
   * null. Ambiguous fuzzy matches return null rather than guessing.
   */
  function matchName(name, index) {
    const norm = normalizeName(name);
    if (!norm) return null;
    const candidates = [norm];
    if (ALIASES[norm]) candidates.push(ALIASES[norm]);
    for (const c of candidates) {
      const hit = index.exact.get(c);
      if (hit && hit.length === 1) return { player: hit[0], method: c === norm ? 'exact' : 'alias' };
    }
    // Reverse alias: list says "Nicolas Claxton", ESPN says "Nic Claxton".
    for (const [short, full] of Object.entries(ALIASES)) {
      if (full === norm) {
        const hit = index.exact.get(short);
        if (hit && hit.length === 1) return { player: hit[0], method: 'alias' };
      }
    }
    const toks = norm.split(' ');
    if (toks.length >= 2) {
      const hit = index.lastInitial.get(toks[toks.length - 1] + '|' + toks[0][0]);
      if (hit && hit.length === 1) return { player: hit[0], method: 'fuzzy' };
    }
    return null;
  }

  Object.assign(HDA, { normalizeName, playerKey, buildNameIndex, matchName, NAME_ALIASES: ALIASES });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
