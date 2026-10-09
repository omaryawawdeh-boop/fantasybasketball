/*
 * Draft engine: merges the user's rankings with ESPN's player pool, resolves
 * picks, computes snake-draft timing, roster fit, and pick suggestions.
 * Pure functions only — no DOM, no network — so everything here is tested.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const BASE_POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const SLOT_ELIGIBILITY = {
    PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'],
    G: ['PG', 'SG'], F: ['SF', 'PF'], 'SG/SF': ['SG', 'SF'], 'G/F': ['PG', 'SG', 'SF', 'PF'],
    'PF/C': ['PF', 'C'], 'F/C': ['SF', 'PF', 'C'], UTIL: BASE_POS, BE: BASE_POS, IR: [],
  };
  const FLEX_SLOTS = new Set(['UTIL', 'BE', 'IR']);
  const DEFAULT_ROSTER = { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, F: 1, UTIL: 3, BE: 3 };

  // ---------- board ----------

  /**
   * @param {object} o
   * @param {Array} o.rankings  user's list from parseRankings().players (may be empty)
   * @param {Array} [o.espnPlayers] normalized ESPN players (may be empty)
   * @param {Array} [o.scoringItems] for projected fantasy points per game
   */
  function buildBoard({ rankings = [], espnPlayers = [], scoringItems = [] } = {}) {
    const index = HDA.buildNameIndex(espnPlayers);
    const players = [];
    const byKey = new Map();
    const espnIdToKey = new Map();
    const nameToKey = new Map();
    const unmatched = [];
    const usedEspn = new Set();

    const add = (bp) => {
      players.push(bp);
      byKey.set(bp.key, bp);
      if (bp.espnId != null) espnIdToKey.set(bp.espnId, bp.key);
      const norm = HDA.normalizeName(bp.name);
      if (!nameToKey.has(norm)) nameToKey.set(norm, bp.key);
    };

    for (const r of rankings) {
      let e = null;
      let matchMethod = null;
      if (espnPlayers.length) {
        const m = HDA.matchName(r.name, index);
        if (m && !usedEspn.has(m.player.espnId)) {
          e = m.player;
          matchMethod = m.method;
          usedEspn.add(e.espnId);
        } else unmatched.push(r.name);
      }
      const bp = mergePlayer(r, e, scoringItems);
      bp.matchMethod = matchMethod;
      add(bp);
    }

    const rest = espnPlayers
      .filter((e) => !usedEspn.has(e.espnId))
      .sort((a, b) => rankOf(a) - rankOf(b));
    for (const e of rest) add(mergePlayer(null, e, scoringItems));

    return { players, byKey, espnIdToKey, nameToKey, unmatched, hasList: rankings.length > 0 };
  }

  function rankOf(e) {
    return e.espnRank || e.adp || 9999;
  }

  function mergePlayer(r, e, scoringItems) {
    const name = e ? e.name : r.name;
    const bp = {
      key: e ? 'e' + e.espnId : 'n:' + HDA.normalizeName(r.name),
      name,
      listName: r ? r.name : null,
      espnId: e ? e.espnId : null,
      team: (e && e.team !== 'FA' && e.team) || (r && r.team) || (e && e.team) || null,
      pos: e && e.pos.length ? e.pos : (r && r.pos) || [],
      onList: !!r,
      myRank: r ? r.rank : null,
      tier: r ? r.tier : null,
      espnRank: e ? e.espnRank : null,
      adp: (e && e.adp) || (r && r.adp) || null,
      injury: e ? e.injury : null,
      injuryProne: !!(r && r.injuryProne),
      dontReach: !!(r && r.dontReach),
      rookie: !!(r && r.rookie),
      note: (r && r.note) || null,
      fppg: null,
      statSource: e ? e.statSource : null,
    };
    if (e && e.statLine && scoringItems && scoringItems.length) bp.fppg = HDA.fantasyPoints(e.statLine, scoringItems);
    return bp;
  }

  // ---------- snake timing ----------

  function ownerSlot(overall, teams, snake = true) {
    const round = Math.ceil(overall / teams);
    const i = (overall - 1) % teams;
    return !snake || round % 2 === 1 ? i + 1 : teams - i;
  }

  function pickNumbersForSlot(slot, teams, rounds, snake = true) {
    const out = [];
    for (let r = 1; r <= rounds; r++) {
      out.push(!snake || r % 2 === 1 ? (r - 1) * teams + slot : r * teams - slot + 1);
    }
    return out;
  }

  // ---------- picks -> draft state ----------

  /**
   * @param {object} o
   * @param {object} o.board from buildBoard
   * @param {Array} o.picks [{overall, teamId?, espnId?, key?, name?}]
   * @param {number} o.teams
   * @param {number} o.rounds
   * @param {number} [o.mySlot] 1-based draft position
   * @param {number} [o.myTeamId] ESPN team id (preferred over slot when picks carry teamId)
   * @param {number[]} [o.pickOrder] ESPN teamIds in draft order
   * @param {boolean} [o.snake]
   * @param {Record<string, boolean>} [o.mineOverrides]
   */
  function computeDraft({ board, picks = [], teams, rounds, mySlot, myTeamId, pickOrder = [], snake = true, mineOverrides = {} }) {
    let slot = mySlot || null;
    if (myTeamId != null && pickOrder.length) {
      const i = pickOrder.indexOf(myTeamId);
      if (i >= 0) slot = i + 1;
    }
    const drafted = new Map();
    const unresolved = [];
    // One pick per overall slot: a refreshed payload replaces, never appends.
    const byOverall = new Map();
    for (const pk of picks) if (pk && pk.overall > 0) byOverall.set(pk.overall, pk);
    const ordered = [...byOverall.values()].sort((a, b) => a.overall - b.overall);
    for (const pk of ordered) {
      const key = resolvePickKey(board, pk);
      if (!key) { unresolved.push(pk); continue; }
      let mine;
      if (mineOverrides[key] != null) mine = !!mineOverrides[key];
      else if (myTeamId != null && pk.teamId != null) mine = pk.teamId === myTeamId;
      else mine = slot != null && ownerSlot(pk.overall, teams, snake) === slot;
      drafted.set(key, { overall: pk.overall, teamId: pk.teamId ?? null, mine });
    }
    // Overrides can also claim players that were never logged as picks.
    for (const [key, v] of Object.entries(mineOverrides)) {
      if (v && !drafted.has(key) && board.byKey.has(key)) drafted.set(key, { overall: null, teamId: null, mine: true });
    }

    const totalPicks = teams * rounds;
    const lastOverall = ordered.length ? ordered[ordered.length - 1].overall : 0;
    const currentPick = Math.min(Math.max(lastOverall, ordered.length) + 1, totalPicks + 1);
    const complete = currentPick > totalPicks;
    const mine = slot ? pickNumbersForSlot(slot, teams, rounds, snake) : [];
    const upcoming = mine.filter((n) => n >= currentPick);
    const onClock = !complete && upcoming[0] === currentPick;
    const myNextPick = upcoming[0] || null;
    const myFollowingPick = onClock ? upcoming[1] || null : myNextPick;

    const myPlayers = [...drafted.entries()]
      .filter(([, d]) => d.mine)
      .map(([key, d]) => ({ ...board.byKey.get(key), overall: d.overall }))
      .sort((a, b) => (a.overall ?? 1e9) - (b.overall ?? 1e9));

    return {
      drafted, unresolved, teams, rounds, mySlot: slot, totalPicks, currentPick, complete,
      onClock, myNextPick, myFollowingPick,
      picksAway: myNextPick ? myNextPick - currentPick : null,
      myPickNumbers: mine,
      currentOwnerSlot: complete ? null : ownerSlot(currentPick, teams, snake),
      currentRound: complete ? rounds : Math.ceil(currentPick / teams),
      myPlayers,
    };
  }

  function resolvePickKey(board, pk) {
    if (pk.key && board.byKey.has(pk.key)) return pk.key;
    if (pk.espnId != null && board.espnIdToKey.has(pk.espnId)) return board.espnIdToKey.get(pk.espnId);
    if (pk.name) {
      const k = board.nameToKey.get(HDA.normalizeName(pk.name));
      if (k) return k;
    }
    return null;
  }

  /**
   * Merge picks from ESPN's league data (base) with picks seen live in the
   * draft room (extras: live feed, page reading). A player is counted once;
   * extras without a known pick number are numbered after the known picks,
   * in the order they were seen.
   */
  function pickKey(p) {
    return p.key || (p.espnId != null ? 'e' + p.espnId : null);
  }

  function mergePicks(base, extras) {
    const out = [...base];
    const used = new Set(base.map((p) => p.overall));
    const have = new Set(base.map(pickKey).filter(Boolean));
    let next = base.reduce((m, p) => Math.max(m, p.overall || 0), 0);
    for (const x of extras || []) {
      const k = pickKey(x);
      if (k && have.has(k)) continue;
      if (k) have.add(k);
      let o = x.overall && !used.has(x.overall) ? x.overall : null;
      if (!o) { o = next + 1; while (used.has(o)) o++; }
      used.add(o);
      next = Math.max(next, o);
      out.push({ ...x, overall: o });
    }
    return out;
  }

  // ---------- roster fit ----------

  /** Max number of dedicated (positional) starting slots filled — bipartite matching. */
  function dedicatedSlotsFilled(rosterSlots, playersPos) {
    const slots = [];
    for (const [name, count] of Object.entries(rosterSlots || {})) {
      if (FLEX_SLOTS.has(name) || !SLOT_ELIGIBILITY[name]) continue;
      for (let i = 0; i < count; i++) slots.push(name);
    }
    const slotOwner = new Array(slots.length).fill(-1);
    const tryAssign = (pi, seen) => {
      for (let s = 0; s < slots.length; s++) {
        if (seen[s] || !SLOT_ELIGIBILITY[slots[s]].some((p) => playersPos[pi].includes(p))) continue;
        seen[s] = true;
        if (slotOwner[s] < 0 || tryAssign(slotOwner[s], seen)) { slotOwner[s] = pi; return true; }
      }
      return false;
    };
    let filled = 0;
    for (let pi = 0; pi < playersPos.length; pi++) if (tryAssign(pi, new Array(slots.length).fill(false))) filled++;
    const open = slots.filter((_, s) => slotOwner[s] < 0);
    return { filled, total: slots.length, open };
  }

  function positionCounts(players) {
    const c = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const p of players) for (const pos of p.pos || []) if (c[pos] != null) c[pos]++;
    return c;
  }

  // ---------- availability model ----------

  function normalCdf(x) {
    // Abramowitz & Stegun 7.1.26
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  /**
   * Estimated probability a player still on the board at `currentPick` is
   * taken before `targetPick`. Draft slot ~ Normal(adp, sd), sd grows with ADP.
   */
  function probGoneBefore(adp, currentPick, targetPick) {
    if (!adp || !targetPick || targetPick <= currentPick) return adp ? 0 : null;
    const sd = Math.max(3, adp * 0.2);
    const F = (k) => normalCdf((k - 0.5 - adp) / sd);
    const survivedSoFar = Math.max(1 - F(currentPick), 1e-9);
    const p = (F(targetPick) - F(currentPick)) / survivedSoFar;
    return Math.min(1, Math.max(0, p));
  }

  // ---------- suggestions ----------

  /**
   * What to pick now. The user's list order is law: the top suggestion is
   * always the highest-ranked available player on their board, and nothing
   * here reorders it. Tier cliffs, roster holes, injury flags, "Don't Reach"
   * tags and the chance a player survives to your next pick are attached as
   * notes so you can see them at a glance — never applied as re-ranking.
   */
  function suggest({ board, draft, rosterSlots = DEFAULT_ROSTER, limit = 6, depth = 30 }) {
    const available = board.players.filter((p) => !draft.drafted.has(p.key));
    const listAvail = available.filter((p) => p.onList);
    const usingList = board.hasList && listAvail.length > 0;
    const candidates = (usingList ? listAvail : available).slice(0, depth);
    const myPos = draft.myPlayers.map((p) => p.pos || []);
    const base = dedicatedSlotsFilled(rosterSlots, myPos);
    const tierLeft = new Map();
    for (const p of listAvail) if (p.tier != null) tierLeft.set(p.tier, (tierLeft.get(p.tier) || 0) + 1);
    const nextTurn = draft.myFollowingPick;
    const picksLeft = Math.max(0, draft.rounds - draft.myPlayers.length);

    const annotated = candidates.map((p, i) => {
      const notes = [];
      if (p.onList && p.tier != null) {
        const left = tierLeft.get(p.tier) || 0;
        if (left === 1) notes.push({ kind: 'tier', text: `Last one left in Tier ${p.tier}` });
        else if (left === 2) notes.push({ kind: 'tier', text: `2 left in Tier ${p.tier}` });
      }
      const pGone = probGoneBefore(p.adp, draft.currentPick, nextTurn);
      if (pGone != null && nextTurn) {
        const pct = Math.round(pGone * 100);
        notes.push(pGone >= 0.95
          ? { kind: 'gone', text: `Won\u2019t last to your pick #${nextTurn} (ADP ${p.adp})` }
          : pGone >= 0.5
          ? { kind: 'gone', text: `~${pct}% gone before your pick #${nextTurn} (ADP ${p.adp})` }
          : { kind: 'wait', text: `~${100 - pct}% still there at #${nextTurn} (ADP ${p.adp})` });
      }
      // DR is acknowledged, never enforced: it changes nothing about the order.
      if (p.dontReach) notes.push({ kind: 'dr', text: `DR \u2014 you like him here${p.adp ? `; market ADP ${p.adp}` : ''}` });
      if (p.injuryProne) notes.push({ kind: 'inj', text: 'Injury prone (*)' });
      if (p.injury) notes.push({ kind: 'status', text: `Status: ${p.injury.replace(/_/g, ' ').toLowerCase()}` });
      if (p.pos && p.pos.length) {
        const fit = dedicatedSlotsFilled(rosterSlots, [...myPos, p.pos]);
        if (fit.filled > base.filled) notes.push({ kind: 'need', text: `Fills your open ${p.pos.join('/')} need` });
        else if (base.open.length && base.open.length >= picksLeft) notes.push({ kind: 'warn', text: `Doesn\u2019t fill an open slot (${base.open.join(', ')} still empty)` });
      }
      return { player: p, boardRank: i + 1, pGone, notes };
    });

    const suggestions = annotated.slice(0, limit);
    const likelyAtNext = nextTurn
      ? annotated.filter((a) => a.pGone != null && a.pGone < 0.5).slice(0, 6).map((a) => ({ player: a.player, pAvail: 1 - a.pGone }))
      : [];
    return { suggestions, likelyAtNext, rosterFit: base, positionCounts: positionCounts(draft.myPlayers), usingList };
  }

  /** Group the user's list by tier, with draft status per player. */
  function tiers(board, draft) {
    const groups = new Map();
    for (const p of board.players) {
      if (!p.onList) continue;
      const t = p.tier ?? 1;
      if (!groups.has(t)) groups.set(t, []);
      const d = draft.drafted.get(p.key);
      groups.get(t).push({ ...p, drafted: !!d, mine: !!(d && d.mine), overall: d ? d.overall : null });
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, players]) => ({ tier, players, left: players.filter((p) => !p.drafted).length }));
  }

  Object.assign(HDA, {
    SLOT_ELIGIBILITY, DEFAULT_ROSTER, buildBoard, mergePicks, pickKey, ownerSlot, pickNumbersForSlot, computeDraft,
    dedicatedSlotsFilled, normalCdf, probGoneBefore, suggest, tiers,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
