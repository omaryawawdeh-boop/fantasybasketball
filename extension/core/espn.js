/*
 * ESPN fantasy basketball ("fba") API: URLs + pure parsers that turn raw
 * responses into the assistant's normalized shapes.
 *
 * These are the same read endpoints ESPN's own web app calls from the draft
 * room. They are undocumented, so every parser is defensive: missing fields
 * degrade to null instead of throwing, and callers fall back to page-reading
 * or manual tracking when a request fails.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const API_ROOT = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons';

  const PRO_TEAMS = {
    0: 'FA', 1: 'ATL', 2: 'BOS', 3: 'NOP', 4: 'CHI', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GSW',
    10: 'HOU', 11: 'IND', 12: 'LAC', 13: 'LAL', 14: 'MIA', 15: 'MIL', 16: 'MIN', 17: 'BKN', 18: 'NYK',
    19: 'ORL', 20: 'PHI', 21: 'PHX', 22: 'POR', 23: 'SAC', 24: 'SAS', 25: 'OKC', 26: 'UTA', 27: 'WAS',
    28: 'TOR', 29: 'MEM', 30: 'CHA',
  };
  // Lineup slot ids used in eligibleSlots and rosterSettings.lineupSlotCounts.
  const SLOTS = {
    0: 'PG', 1: 'SG', 2: 'SF', 3: 'PF', 4: 'C', 5: 'G', 6: 'F', 7: 'SG/SF', 8: 'G/F', 9: 'PF/C',
    10: 'F/C', 11: 'UTIL', 12: 'BE', 13: 'IR',
  };
  const DEFAULT_POS = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' };

  function defaultSeasonId(date) {
    const d = date || new Date();
    // NBA seasons are named by the year they end; ESPN opens the next one in late summer.
    return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear();
  }

  function leagueUrl(seasonId, leagueId, views) {
    const q = views.map((v) => 'view=' + encodeURIComponent(v)).join('&');
    return `${API_ROOT}/${seasonId}/segments/0/leagues/${leagueId}?${q}`;
  }

  function draftUrls(seasonId, leagueId) {
    return {
      league: leagueUrl(seasonId, leagueId, ['mDraftDetail', 'mSettings', 'mTeams']),
      players: leagueUrl(seasonId, leagueId, ['kona_player_info']),
      playersHeaders: {
        'x-fantasy-filter': JSON.stringify({
          players: {
            limit: 500,
            sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'STANDARD' },
          },
        }),
      },
      // League-independent pool (works when the league endpoint is not readable).
      playerPool: `${API_ROOT}/${seasonId}/players?scoringPeriodId=0&view=players_wl`,
      playerPoolHeaders: { 'x-fantasy-filter': JSON.stringify({ filterActive: { value: true } }) },
    };
  }

  function positionsFromSlots(eligibleSlots, defaultPositionId) {
    const out = [];
    for (const s of eligibleSlots || []) {
      const name = SLOTS[s];
      if (['PG', 'SG', 'SF', 'PF', 'C'].includes(name) && !out.includes(name)) out.push(name);
    }
    if (!out.length && DEFAULT_POS[defaultPositionId]) out.push(DEFAULT_POS[defaultPositionId]);
    return out;
  }

  /** Pick the per-game projection line for this season, falling back to last season's actuals. */
  function pickStatLine(stats, seasonId) {
    if (!Array.isArray(stats)) return { line: null, source: null };
    const avg = (s) => s && (s.averageStats || null);
    const proj = stats.find((s) => s.statSourceId === 1 && s.statSplitTypeId === 0 && s.seasonId === seasonId && avg(s));
    if (proj) return { line: proj.averageStats, source: `ESPN ${seasonId - 1}-${String(seasonId).slice(2)} projection` };
    const last = stats.find((s) => s.statSourceId === 0 && s.statSplitTypeId === 0 && s.seasonId === seasonId - 1 && avg(s));
    if (last) return { line: last.averageStats, source: `${seasonId - 2}-${String(seasonId - 1).slice(2)} actual` };
    return { line: null, source: null };
  }

  function normalizePlayer(raw, seasonId) {
    const p = raw && (raw.player || raw);
    if (!p || p.id == null) return null;
    const ranks = p.draftRanksByRankType || {};
    const rank = (ranks.STANDARD && ranks.STANDARD.rank) || (ranks.PPR && ranks.PPR.rank) || null;
    const adp = p.ownership && p.ownership.averageDraftPosition > 0 ? Math.round(p.ownership.averageDraftPosition * 10) / 10 : null;
    const { line, source } = pickStatLine(p.stats, seasonId);
    return {
      espnId: p.id,
      name: p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' '),
      team: PRO_TEAMS[p.proTeamId] || null,
      pos: positionsFromSlots(p.eligibleSlots, p.defaultPositionId),
      espnRank: rank,
      adp,
      injury: p.injuryStatus && p.injuryStatus !== 'ACTIVE' ? p.injuryStatus : null,
      statLine: line,
      statSource: source,
    };
  }

  /** kona_player_info ({players:[...]}) or players_wl (array) -> normalized players. */
  function parsePlayers(json, seasonId) {
    const arr = Array.isArray(json) ? json : (json && json.players) || [];
    return arr.map((r) => normalizePlayer(r, seasonId)).filter(Boolean);
  }

  function parseLeague(json) {
    if (!json || typeof json !== 'object') return null;
    const settings = json.settings || {};
    const draftSettings = settings.draftSettings || {};
    const roster = (settings.rosterSettings && settings.rosterSettings.lineupSlotCounts) || {};
    const rosterSlots = {};
    let rounds = 0;
    for (const [id, count] of Object.entries(roster)) {
      const name = SLOTS[id];
      if (!name || !count) continue;
      rosterSlots[name] = count;
      if (name !== 'IR') rounds += count;
    }
    const scoring = settings.scoringSettings || {};
    const teams = (json.teams || []).map((t) => ({
      id: t.id,
      abbrev: t.abbrev || null,
      name: t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`,
      owners: Array.isArray(t.owners) ? t.owners : [],
    }));
    const dd = json.draftDetail || {};
    const picks = (dd.picks || [])
      .filter((pk) => pk.playerId != null && pk.playerId > 0)
      .map((pk) => ({
        overall: pk.overallPickNumber,
        round: pk.roundId,
        teamId: pk.teamId,
        espnId: pk.playerId,
        keeper: !!pk.keeper,
      }))
      .sort((a, b) => a.overall - b.overall);
    return {
      id: json.id,
      name: settings.name || null,
      size: settings.size || teams.length || null,
      draftType: draftSettings.type || null,
      draftDate: typeof draftSettings.date === 'number' && draftSettings.date > 0 ? draftSettings.date : null,
      pickOrder: Array.isArray(draftSettings.pickOrder) ? draftSettings.pickOrder : [],
      rosterSlots: Object.keys(rosterSlots).length ? rosterSlots : null,
      rounds: rounds || null,
      scoringType: scoring.scoringType || null,
      scoringItems: (scoring.scoringItems || [])
        .filter((it) => it && it.statId != null && typeof it.points === 'number')
        .map((it) => ({ statId: it.statId, points: it.points })),
      teams,
      draft: { inProgress: !!dd.inProgress, complete: !!dd.drafted, picks },
    };
  }

  /** leagueId / seasonId / teamId from a draft-room URL. */
  function parseDraftUrl(href) {
    try {
      const u = new URL(href);
      const n = (k) => (u.searchParams.get(k) && !isNaN(Number(u.searchParams.get(k))) ? Number(u.searchParams.get(k)) : null);
      return { leagueId: n('leagueId'), seasonId: n('seasonId'), teamId: n('teamId') };
    } catch (e) {
      return { leagueId: null, seasonId: null, teamId: null };
    }
  }

  Object.assign(HDA, {
    ESPN_API_ROOT: API_ROOT, ESPN_PRO_TEAMS: PRO_TEAMS, ESPN_SLOTS: SLOTS,
    defaultSeasonId, draftUrls, parsePlayers, parseLeague, parseDraftUrl, positionsFromSlots,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
