// Mocked ESPN responses shaped like the fba v3 API. Synthetic players only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');

const leagueJson = {
  id: 555,
  settings: {
    name: 'Test League',
    size: 4,
    draftSettings: { type: 'SNAKE', pickOrder: [4, 2, 1, 3] },
    rosterSettings: { lineupSlotCounts: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1, 7: 0 } },
    scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: [{ statId: 0, points: 1 }, { statId: 11, points: -2 }, { statId: 99 }] },
  },
  teams: [{ id: 1, abbrev: 'AAA', name: 'Team A' }, { id: 2, location: 'Big', nickname: 'Ballers' }],
  draftDetail: {
    inProgress: true,
    drafted: false,
    picks: [
      { overallPickNumber: 2, roundId: 1, teamId: 2, playerId: 11 },
      { overallPickNumber: 1, roundId: 1, teamId: 4, playerId: 10 },
      { overallPickNumber: 3, roundId: 1, teamId: 1, playerId: -1 },
    ],
  },
};

test('parseLeague normalizes settings, roster, scoring, picks', () => {
  const L = HDA.parseLeague(leagueJson);
  assert.equal(L.size, 4);
  assert.deepEqual(L.pickOrder, [4, 2, 1, 3]);
  assert.deepEqual(L.rosterSlots, { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, F: 1, UTIL: 3, BE: 3, IR: 1 });
  assert.equal(L.rounds, 13, 'IR excluded from rounds');
  assert.deepEqual(L.scoringItems, [{ statId: 0, points: 1 }, { statId: 11, points: -2 }]);
  assert.equal(L.teams[1].name, 'Big Ballers');
  assert.deepEqual(L.draft.picks.map((p) => p.overall), [1, 2], 'empty picks dropped, sorted');
  assert.equal(L.draft.inProgress, true);
});

test('parseLeague tolerates junk', () => {
  assert.equal(HDA.parseLeague(null), null);
  const L = HDA.parseLeague({});
  assert.equal(L.rosterSlots, null);
  assert.deepEqual(L.draft.picks, []);
});

test('parsePlayers handles kona_player_info and players_wl shapes', () => {
  const kona = {
    players: [{
      id: 10,
      player: {
        id: 10, fullName: 'Test Center', proTeamId: 7, defaultPositionId: 5, eligibleSlots: [4, 9, 10, 11, 12, 13],
        injuryStatus: 'ACTIVE',
        draftRanksByRankType: { STANDARD: { rank: 3 } },
        ownership: { averageDraftPosition: 2.345 },
        stats: [
          { seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, averageStats: { 0: 20 } },
          { seasonId: 2027, statSourceId: 1, statSplitTypeId: 0, averageStats: { 0: 24 } },
        ],
      },
    }],
  };
  const [p] = HDA.parsePlayers(kona, 2027);
  assert.equal(p.espnId, 10);
  assert.equal(p.team, 'DEN');
  assert.deepEqual(p.pos, ['C']);
  assert.equal(p.adp, 2.3);
  assert.equal(p.espnRank, 3);
  assert.equal(p.injury, null);
  assert.deepEqual(p.statLine, { 0: 24 });
  assert.match(p.statSource, /projection/);

  const wl = [{ id: 11, fullName: 'Wing Guy', proTeamId: 0, defaultPositionId: 3, injuryStatus: 'OUT' }];
  const [w] = HDA.parsePlayers(wl, 2027);
  assert.deepEqual(w.pos, ['SF'], 'falls back to default position');
  assert.equal(w.team, 'FA');
  assert.equal(w.injury, 'OUT');
  assert.equal(w.statLine, null);
});

test('parsePlayers falls back to last season actuals', () => {
  const [p] = HDA.parsePlayers([{ id: 1, fullName: 'X Y', stats: [{ seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, averageStats: { 0: 9 } }] }], 2027);
  assert.deepEqual(p.statLine, { 0: 9 });
  assert.match(p.statSource, /actual/);
});

test('parseDraftUrl and defaultSeasonId', () => {
  assert.deepEqual(
    HDA.parseDraftUrl('https://fantasy.espn.com/basketball/draft?leagueId=1777076&seasonId=2027&teamId=1&memberId=x'),
    { leagueId: 1777076, seasonId: 2027, teamId: 1 },
  );
  assert.deepEqual(HDA.parseDraftUrl('not a url'), { leagueId: null, seasonId: null, teamId: null });
  assert.equal(HDA.defaultSeasonId(new Date(2026, 9, 9)), 2027);
  assert.equal(HDA.defaultSeasonId(new Date(2027, 2, 1)), 2027);
});

test('end to end: ESPN league + players -> draft state', () => {
  const L = HDA.parseLeague(leagueJson);
  const players = HDA.parsePlayers([
    { id: 10, fullName: 'Test Center', eligibleSlots: [4], ownership: { averageDraftPosition: 1 } },
    { id: 11, fullName: 'Test Guard', eligibleSlots: [0, 1], ownership: { averageDraftPosition: 2 } },
    { id: 12, fullName: 'Test Wing', eligibleSlots: [2], ownership: { averageDraftPosition: 3 } },
  ], 2027);
  const rankings = HDA.parseRankings('Tier 1\nTest Guard\nTest Center\nTier 2\nTest Wing').players;
  const board = HDA.buildBoard({ rankings, espnPlayers: players, scoringItems: L.scoringItems });
  const d = HDA.computeDraft({ board, picks: L.draft.picks, teams: L.size, rounds: L.rounds, myTeamId: 2, pickOrder: L.pickOrder });
  assert.equal(d.mySlot, 2);
  assert.deepEqual(d.myPlayers.map((p) => p.name), ['Test Guard']);
  assert.equal(d.currentPick, 3);
  assert.equal(d.myNextPick, 7);
  const s = HDA.suggest({ board, draft: d, rosterSlots: L.rosterSlots });
  assert.equal(s.suggestions[0].player.name, 'Test Wing');
});
