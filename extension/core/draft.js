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
      age: (e && e.age != null ? e.age : null) ?? (r && r.dob && HDA.ageFromDob ? HDA.ageFromDob(r.dob) : null),
      gamesLastSeason: e && e.gamesLastSeason != null ? e.gamesLastSeason : null,
      injuryProne: !!(r && r.injuryProne),
      dontReach: !!(r && r.dontReach),
      rookie: !!(r && r.rookie),
      note: (r && r.note) || null,
      fppg: null,
      fppgProj: null,
      fppgLast: null,
      fppgLastSource: null,
      mktRank: null,
      statSource: e ? e.statSource : null,
    };
    if (e && e.statLine && scoringItems && scoringItems.length) bp.fppg = HDA.fantasyPoints(e.statLine, scoringItems);
    // Edit-view numbers: projected and last-season fantasy points per game in YOUR scoring.
    if (e && scoringItems && scoringItems.length) {
      if (e.projLine) bp.fppgProj = HDA.fantasyPoints(e.projLine, scoringItems);
      if (e.lastLine) { bp.fppgLast = HDA.fantasyPoints(e.lastLine, scoringItems); bp.fppgLastSource = 'ESPN'; }
    }
    // Fallback when ESPN isn't loaded: your tier sheet's 2025-26 numbers (already in your scoring).
    const sheet = HDA.TIER_SHEET_STATS && HDA.TIER_SHEET_STATS.byName ? HDA.TIER_SHEET_STATS.byName.get(HDA.normalizeName(r ? r.name : name)) || HDA.TIER_SHEET_STATS.byName.get(HDA.normalizeName(name)) : null;
    if (sheet) {
      if (bp.fppgLast == null && sheet.fp != null) { bp.fppgLast = sheet.fp; bp.fppgLastSource = 'tier sheet'; }
      if (bp.gamesLastSeason == null && sheet.gp != null) bp.gamesLastSeason = sheet.gp;
      if (sheet.mkt != null) bp.mktRank = sheet.mkt;
      if (sheet.line) bp.lastLineText = sheet.line;
    }
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

  // ---------- availability odds (Monte Carlo) ----------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Chance each available player is still there at your next 1..horizons
   * turns, from simulating the rest of the draft from the CURRENT board.
   *
   * Model: every remaining pick (yours included, assuming you take someone
   * else) goes to the available player with the lowest "draft spot", drawn
   * per simulation as ADP + noise (spread grows with ADP, as real ADP spreads
   * do). Because each run starts from who is actually left, the odds react to
   * runs, reaches and fallers after every pick. Seeded, so numbers only move
   * when the draft does.
   *
   * @returns {{targets:number[], odds: Map<string, Array<number|null>>, sims:number}}
   */
  function availabilityOdds({ board, draft, sims = 2000, horizons = 3 }) {
    const odds = new Map();
    const upcoming = (draft.myPickNumbers || []).filter((n) => n >= draft.currentPick);
    const targets = (draft.onClock ? upcoming.slice(1) : upcoming).slice(0, horizons);
    if (!targets.length || draft.complete) return { targets, odds, sims: 0 };
    const picksBefore = targets.map((t) => t - draft.currentPick); // picks made before each of your turns
    const maxK = picksBefore[picksBefore.length - 1];

    const available = board.players.filter((p) => !draft.drafted.has(p.key));
    const withAdp = available.filter((p) => p.adp > 0).sort((a, b) => a.adp - b.adp);
    // Players far beyond the window can't affect who's left; cap the pool for speed.
    const lastAdp = withAdp.length ? withAdp[Math.min(withAdp.length - 1, maxK + 120)].adp : 0;
    const pool = withAdp.filter((p) => p.adp <= Math.max(lastAdp, draft.currentPick + maxK + 60));
    const n = pool.length;
    const mean = pool.map((p) => p.adp);
    // Spread: ~1 pick for the top few, ~5 at ADP 30, ~15 at ADP 100 (typical ADP min-max ranges).
    const sd = pool.map((p) => Math.max(1, 0.15 * p.adp + 0.5));
    const survive = targets.map(() => new Float64Array(n));
    const rnd = mulberry32(draft.currentPick * 7919 + draft.drafted.size * 104729 + n);
    const score = new Float64Array(n);
    const order = new Array(n);

    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < n; i += 2) {
        // Box-Muller: two normals per pair of uniforms.
        const u = Math.max(rnd(), 1e-12), v = rnd();
        const r = Math.sqrt(-2 * Math.log(u));
        score[i] = mean[i] + sd[i] * r * Math.cos(2 * Math.PI * v);
        if (i + 1 < n) score[i + 1] = mean[i + 1] + sd[i + 1] * r * Math.sin(2 * Math.PI * v);
      }
      for (let i = 0; i < n; i++) order[i] = i;
      order.sort((a, b) => score[a] - score[b]);
      for (let pos = 0; pos < n; pos++) {
        const i = order[pos];
        for (let h = 0; h < targets.length; h++) if (pos >= picksBefore[h]) survive[h][i]++;
      }
    }
    pool.forEach((p, i) => odds.set(p.key, survive.map((arr) => arr[i] / sims)));
    // Available players outside the simulated pool: ADP far past your window -> safe.
    for (const p of available) {
      if (odds.has(p.key)) continue;
      odds.set(p.key, p.adp > 0 ? targets.map(() => 1) : targets.map(() => null));
    }
    return { targets, odds, sims };
  }

  // ---------- suggestions ----------

  /**
   * What to pick now. The user's list order is law: the top suggestion is
   * always the highest-ranked available player on their board, and nothing
   * here reorders it. Tier cliffs, roster holes, injury flags, "Don't Reach"
   * tags and the chance a player survives to your next pick are attached as
   * notes so you can see them at a glance — never applied as re-ranking.
   */
  function suggest({ board, draft, rosterSlots = DEFAULT_ROSTER, limit = 6, depth = 30, avail = null, fit = {} }) {
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
      const sim = avail && avail.targets[0] === nextTurn ? avail.odds.get(p.key) : null;
      const pGone = sim && sim[0] != null ? 1 - sim[0] : probGoneBefore(p.adp, draft.currentPick, nextTurn);
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
    const profile = teamProfile({ myPlayers: draft.myPlayers, rounds: draft.rounds, fit });
    profile.myPos = myPos;
    const fitPick = draft.complete ? null : teamFitPick({ candidates, profile, rosterFit: base, rosterSlots });
    return { suggestions, likelyAtNext, rosterFit: base, positionCounts: positionCounts(draft.myPlayers), usingList, profile, fitPick };
  }

  // ---------- team fit: balance, age, health ----------

  const BUCKET_LABEL = { G: 'guard', F: 'forward', C: 'center' };
  const DEFAULT_FIT = { shares: { G: 0.38, F: 0.38, C: 0.24 }, oldAge: 35, maxOld: 2, maxRisky: 3 };

  /**
   * Injury risk from what we actually know: your "*" flag, games played last
   * season (ESPN), age, and ESPN's current status. Points -> low / med / high.
   */
  function healthRisk(p, oldAge = DEFAULT_FIT.oldAge) {
    const reasons = [];
    let pts = 0;
    if (p.injuryProne) { pts += 2; reasons.push('injury prone (*)'); }
    if (p.gamesLastSeason != null) {
      if (p.gamesLastSeason < 45) { pts += 2; reasons.push(`${p.gamesLastSeason} games last season`); }
      else if (p.gamesLastSeason < 60) { pts += 1; reasons.push(`${p.gamesLastSeason} games last season`); }
    }
    if (p.age != null && p.age >= oldAge) { pts += p.age >= oldAge + 3 ? 2 : 1; reasons.push(`age ${p.age}`); }
    if (p.injury === 'OUT' || p.injury === 'INJURY_RESERVE') { pts += 3; reasons.push(`listed ${p.injury.replace(/_/g, ' ').toLowerCase()}`); }
    else if (p.injury === 'SUSPENSION') { pts += 2; reasons.push('suspended'); }
    else if (p.injury === 'DAY_TO_DAY' || p.injury === 'QUESTIONABLE') { pts += 1; reasons.push('day to day'); }
    return { level: pts >= 3 ? 'high' : pts >= 2 ? 'med' : 'low', points: pts, reasons };
  }

  /** How much a player counts as guard / forward / center (multi-position players split). */
  function bucketFractions(pos) {
    const b = { G: 0, F: 0, C: 0 };
    const ps = (pos || []).filter((p) => BASE_POS.includes(p));
    for (const p of ps) b[p === 'C' ? 'C' : p === 'PG' || p === 'SG' ? 'G' : 'F'] += 1 / ps.length;
    return b;
  }

  /** Whole-roster G/F/C targets that add up to the number of rounds. */
  function balanceTargets(rounds, shares = DEFAULT_FIT.shares) {
    const raw = Object.entries(shares).map(([k, v]) => [k, v * rounds]);
    const t = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
    let left = rounds - Object.values(t).reduce((a, b) => a + b, 0);
    for (const [k] of raw.sort((a, b) => (b[1] % 1) - (a[1] % 1))) { if (left-- <= 0) break; t[k]++; }
    return t;
  }

  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  const fmtCount = (x) => (Math.round(x * 2) / 2).toString();

  /** Snapshot of your roster: position counts vs targets, 35+ players, injury-prone players. */
  function teamProfile({ myPlayers, rounds, fit = {} }) {
    const cfg = { ...DEFAULT_FIT, ...fit };
    const targets = cfg.targets || balanceTargets(rounds, cfg.shares);
    if (cfg.targets) {
      const sum = targets.G + targets.F + targets.C || 1;
      cfg.shares = { G: targets.G / sum, F: targets.F / sum, C: targets.C / sum };
    }
    const counts = { G: 0, F: 0, C: 0 };
    for (const p of myPlayers) { const f = bucketFractions(p.pos); for (const k in counts) counts[k] += f[k]; }
    const old = myPlayers.filter((p) => p.age != null && p.age >= cfg.oldAge);
    const prone = myPlayers.filter((p) => p.injuryProne);
    const risky = myPlayers.filter((p) => healthRisk(p, cfg.oldAge).level !== 'low');
    // 'maxProne' was the older setting (max * players); it maps to max risky players + 1.
    cfg.maxRisky = fit.maxRisky != null ? fit.maxRisky : fit.maxProne != null ? fit.maxProne + 1 : DEFAULT_FIT.maxRisky;
    const picksLeft = Math.max(0, rounds - myPlayers.length);
    return { counts, targets, old, prone, risky, picksLeft, picksMade: myPlayers.length, cfg };
  }

  /**
   * How a player fits YOUR team right now. Returns a score adjustment and
   * plain-English flags: 'bad' (avoid), 'warn' (think twice), 'good' (fills a need).
   */
  function assessFit(player, profile, rosterFit, rosterSlots) {
    const flags = [];
    let adj = 0;
    const { counts, targets, picksLeft, cfg } = profile;
    const frac = bucketFractions(player.pos);
    for (const b of ['G', 'F', 'C']) {
      if (!frac[b]) continue;
      const have = counts[b];
      const need = Math.max(0, targets[b] - have);
      const L = BUCKET_LABEL[b];
      if (have + frac[b] > targets[b] + 0.5) {
        adj -= 30 * frac[b];
        flags.push({ kind: 'bad', bucket: b, short: `Too many ${b}`, text: `Too many ${L}s: you have ${fmtCount(have)} (target ${targets[b]})` });
      } else if (have >= targets[b] - 0.25) {
        adj -= 12 * frac[b];
        flags.push({ kind: 'warn', bucket: b, short: `${b} full`, text: `${L[0].toUpperCase() + L.slice(1)}s are full (${fmtCount(have)} of ${targets[b]})` });
      } else if (picksLeft > 0 && need / picksLeft >= cfg.shares[b] + 0.12) {
        adj += 12 * frac[b];
        flags.push({ kind: 'good', bucket: b, short: `Need ${b}`, text: `You need ${L}s (${fmtCount(have)} of ${targets[b]})` });
      }
    }
    if (rosterFit && player.pos && player.pos.length && rosterSlots) {
      const myPos = (profile.myPos || []);
      if (rosterFit.open.length && dedicatedSlotsFilled(rosterSlots, [...myPos, player.pos]).filled > rosterFit.filled
        && rosterFit.open.length >= picksLeft - 1) {
        adj += 10;
        flags.push({ kind: 'good', short: 'Open slot', text: `Fills an open starting slot (${rosterFit.open.join(', ')} still empty)` });
      }
    }
    if (player.age != null && player.age >= cfg.oldAge) {
      const n = profile.old.length;
      if (n >= cfg.maxOld) {
        adj -= 30;
        flags.push({ kind: 'bad', short: `Age ${player.age}: ${n} vets`, text: `Age ${player.age}: you already have ${n} players ${cfg.oldAge}+` });
      } else if (n === cfg.maxOld - 1) {
        adj -= 8;
        flags.push({ kind: 'warn', short: `Age ${player.age}`, text: `Age ${player.age}: would be your ${ordinal(n + 1)} player ${cfg.oldAge}+` });
      } else {
        flags.push({ kind: 'info', short: `Age ${player.age}`, text: `Age ${player.age}` });
      }
    }
    const risk = healthRisk(player, cfg.oldAge);
    if (risk.level !== 'low') {
      const n = (profile.risky || []).length;
      const why = risk.reasons.join(', ');
      if (n >= cfg.maxRisky) {
        adj -= 25;
        flags.push({ kind: 'bad', short: `${risk.level === 'high' ? 'High' : 'Med'} risk: ${n} already`, text: `Injury risk (${why}): you already have ${n} risky players` });
      } else if (risk.level === 'high') {
        adj -= 10;
        flags.push({ kind: 'warn', short: 'High injury risk', text: `High injury risk: ${why}` });
      } else {
        adj -= 4;
        flags.push({ kind: 'warn', short: 'Injury risk', text: `Some injury risk: ${why}` });
      }
    }
    if (player.injury === 'OUT' || player.injury === 'INJURY_RESERVE') { adj -= 15; flags.push({ kind: 'bad', short: 'OUT', text: `ESPN lists him ${player.injury.replace(/_/g, ' ').toLowerCase()}` }); }
    else if (player.injury === 'SUSPENSION') { adj -= 10; flags.push({ kind: 'bad', short: 'Suspended', text: 'Suspended' }); }
    return { adj, flags, bad: flags.some((f) => f.kind === 'bad') };
  }

  /**
   * The best pick for your TEAM among the next players on your list. Your list
   * sets the baseline (each spot down costs a little); fit flags move players
   * up or down. Returns null when your #1 already fits.
   */
  function teamFitPick({ candidates, profile, rosterFit, rosterSlots, window = 12 }) {
    const pool = candidates.slice(0, window);
    if (!pool.length) return null;
    const scored = pool.map((p, i) => {
      const fit = assessFit(p, profile, rosterFit, rosterSlots);
      return { player: p, fit, listIndex: i, score: 100 - 4 * i + fit.adj };
    });
    const top = scored[0];
    const best = scored.slice().sort((a, b) => b.score - a.score || a.listIndex - b.listIndex)[0];
    const instead = best.player.key !== top.player.key && (top.fit.bad || best.score - top.score >= 8) ? best : null;
    return { top, instead, scored };
  }

  /**
   * A round-by-round plan for all your remaining picks, starting from the
   * current board. At each of your picks it takes the best TEAM fit among the
   * players on your list who are at least 50% likely to still be there
   * (simulated), then updates your projected roster before the next pick.
   * It's a forecast, not a promise: re-run after every pick.
   */
  function draftPlan({ board, draft, rosterSlots = DEFAULT_ROSTER, fit = {}, odds, minAvail = 0.5, window = 12 }) {
    if (!odds || !odds.targets.length) return { rows: [], profile: null };
    const listAvail = board.players.filter((p) => p.onList && !draft.drafted.has(p.key));
    const pool = listAvail.length ? listAvail : board.players.filter((p) => !draft.drafted.has(p.key));
    const team = draft.myPlayers.slice();
    const taken = new Set();
    const rows = [];
    // When you're on the clock right now, plan this pick too (everyone left is available).
    const picks = draft.onClock ? [draft.currentPick, ...odds.targets] : odds.targets;
    picks.forEach((pick, h) => {
      const oddsIdx = draft.onClock ? h - 1 : h;
      // null = no ESPN ADP, so the market isn't drafting him: treat as available, label it honestly.
      const chance = (p) => (oddsIdx < 0 ? 1 : ((odds.odds.get(p.key) || [])[oddsIdx] ?? (p.adp ? 1 : null)));
      const cands = pool.filter((p) => !taken.has(p.key) && (chance(p) == null || chance(p) >= minAvail));
      if (!cands.length) { rows.push({ pick, player: null }); return; }
      const profile = teamProfile({ myPlayers: team, rounds: draft.rounds, fit });
      profile.myPos = team.map((p) => p.pos || []);
      const rf = dedicatedSlotsFilled(rosterSlots, profile.myPos);
      const fp = teamFitPick({ candidates: cands, profile, rosterFit: rf, rosterSlots, window });
      const choice = fp.instead || fp.top;
      taken.add(choice.player.key);
      team.push(choice.player);
      const alts = fp.scored.filter((x) => x.player.key !== choice.player.key && !x.fit.bad)
        .sort((a, b) => b.score - a.score).slice(0, 2).map((x) => ({ player: x.player, chance: chance(x.player) }));
      rows.push({ pick, round: Math.ceil(pick / draft.teams), player: choice.player, chance: chance(choice.player), fit: choice.fit, alts, overList: !!fp.instead });
    });
    const final = teamProfile({ myPlayers: team, rounds: draft.rounds, fit });
    return { rows, profile: final };
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
    dedicatedSlotsFilled, normalCdf, probGoneBefore, availabilityOdds, suggest, tiers,
    bucketFractions, balanceTargets, teamProfile, assessFit, teamFitPick, DEFAULT_FIT, healthRisk, draftPlan,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
