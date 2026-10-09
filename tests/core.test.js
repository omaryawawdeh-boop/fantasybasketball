// Synthetic fixtures only — no real projections or live data.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');

test('normalizeName strips accents, punctuation and suffixes', () => {
  assert.equal(HDA.normalizeName('Nikola Jokić'), 'nikola jokic');
  assert.equal(HDA.normalizeName('Jaren Jackson Jr.'), 'jaren jackson');
  assert.equal(HDA.normalizeName("De'Aaron Fox"), 'deaaron fox');
  assert.equal(HDA.normalizeName('Shai Gilgeous-Alexander'), 'shai gilgeous alexander');
});

test('matchName: exact, alias, fuzzy, and refuses ambiguity', () => {
  const pool = [
    { espnId: 1, name: 'Nicolas Claxton' },
    { espnId: 2, name: 'Jalen Williams' },
    { espnId: 3, name: 'Jaylin Williams' },
    { espnId: 4, name: 'Victor Wembanyama' },
  ];
  const idx = HDA.buildNameIndex(pool);
  assert.equal(HDA.matchName('Nic Claxton', idx).player.espnId, 1);
  assert.equal(HDA.matchName('Nic Claxton', idx).method, 'alias');
  assert.equal(HDA.matchName('victor wembanyama', idx).method, 'exact');
  assert.equal(HDA.matchName('V. Wembanyama', idx), null, 'single-letter first names are too vague');
  assert.equal(HDA.matchName('Jal Williams', idx), null, 'two J. Williams -> ambiguous');
  assert.equal(HDA.matchName('Vic Wembanyama', idx).method, 'fuzzy');
});

test('parseRankings: tier headings, numbering, parentheticals', () => {
  const { players, warnings, tierLabels } = HDA.parseRankings(`
Tier 1: Franchise
1. Player Alpha (DEN - C)
2. Player Bravo, OKC, PG

Tier 2
3) Player Charlie | SAS | C
- Player Delta PHX SG/SF
Player Alpha
`);
  assert.equal(players.length, 4);
  assert.deepEqual(players.map((p) => p.tier), [1, 1, 2, 2]);
  assert.deepEqual(players[0], { rank: 1, name: 'Player Alpha', tier: 1, pos: ['C'], team: 'DEN', adp: null });
  assert.equal(players[1].team, 'OKC');
  assert.deepEqual(players[1].pos, ['PG']);
  assert.equal(players[2].team, 'SAS');
  assert.equal(players[3].name, 'Player Delta');
  assert.deepEqual(players[3].pos, ['SG', 'SF']);
  assert.equal(tierLabels[1], 'Franchise');
  assert.ok(warnings.some((w) => /Duplicate/.test(w)));
});

test('parseRankings: blank lines become tiers when no headings', () => {
  const { players } = HDA.parseRankings('A One\nB Two\n\nC Three\n\n\nD Four');
  assert.deepEqual(players.map((p) => p.tier), [1, 1, 2, 3]);
});

test('parseRankings: CSV with rank/tier/adp columns, sorted by rank', () => {
  const { players, format } = HDA.parseRankings('Player,Rank,Tier,Pos,Team,ADP\n"Second Guy",2,1,G,BOS,4.5\nFirst Guy,1,1,C,DEN,1.2\nThird Guy,3,2,F,MIA,');
  assert.equal(format, 'csv');
  assert.deepEqual(players.map((p) => p.name), ['First Guy', 'Second Guy', 'Third Guy']);
  assert.deepEqual(players[1].pos, ['PG', 'SG']);
  assert.equal(players[1].adp, 4.5);
  assert.equal(players[2].adp, null);
  assert.equal(players[2].tier, 2);
});

test('rankingsToText round-trips', () => {
  const src = 'Tier 1\nA Guy (DEN - C)\nB Guy\n\nTier 2\nC Guy (LAL - PG/SG)';
  const parsed = HDA.parseRankings(src);
  const again = HDA.parseRankings(HDA.rankingsToText(parsed.players, parsed.tierLabels));
  assert.deepEqual(again.players, parsed.players);
});

test('fantasyPoints with ESPN default points', () => {
  const items = HDA.weightsToItems(HDA.SCORING_PRESETS.espn_points.weights);
  const line = { 0: 20, 17: 2, 14: 15, 13: 8, 16: 4, 15: 2, 6: 10, 3: 5, 2: 1, 1: 1, 11: 3 };
  // 20 +2 -15 +16 -4 +2 +10 +10 +4 +4 -6 = 43
  assert.equal(HDA.fantasyPoints(line, items), 43);
  assert.equal(HDA.fantasyPoints({}, items), null);
  assert.equal(HDA.fantasyPoints({ 4: 3, 5: 7 }, [{ statId: 6, points: 1.5 }]), 15, 'REB derived from OREB+DREB');
});

test('snake pick math', () => {
  assert.deepEqual(HDA.pickNumbersForSlot(1, 12, 4), [1, 24, 25, 48]);
  assert.deepEqual(HDA.pickNumbersForSlot(12, 12, 3), [12, 13, 36]);
  assert.deepEqual(HDA.pickNumbersForSlot(3, 10, 3, false), [3, 13, 23]);
  assert.equal(HDA.ownerSlot(13, 12), 12);
  assert.equal(HDA.ownerSlot(24, 12), 1);
  assert.equal(HDA.ownerSlot(25, 12), 1);
});

function fixture() {
  const rankings = HDA.parseRankings(`Tier 1
Alpha One (C)
Bravo Two (PG)
Tier 2
Charlie Three (PG)
Delta Four (SF/PF)
Echo Five (C)
Tier 3
Foxtrot Six (SG)`).players;
  const espnPlayers = [
    { espnId: 101, name: 'Alpha One', team: 'DEN', pos: ['C'], espnRank: 2, adp: 1.5, injury: null, statLine: { 0: 25 } },
    { espnId: 102, name: 'Bravo Two', team: 'OKC', pos: ['PG'], espnRank: 1, adp: 1.6, injury: null, statLine: { 0: 30 } },
    { espnId: 103, name: 'Charlie Three', team: 'BOS', pos: ['PG', 'SG'], espnRank: 3, adp: 6, injury: null },
    { espnId: 104, name: 'Delta Four', team: 'MIA', pos: ['SF', 'PF'], espnRank: 4, adp: 20, injury: 'OUT' },
    { espnId: 105, name: 'Echo Five', team: 'LAL', pos: ['C'], espnRank: 5, adp: 7, injury: null },
    { espnId: 107, name: 'Golf Seven', team: 'NYK', pos: ['PF'], espnRank: 6, adp: 9, injury: null },
  ];
  const board = HDA.buildBoard({ rankings, espnPlayers, scoringItems: [{ statId: 0, points: 1 }] });
  return { rankings, espnPlayers, board };
}

test('buildBoard merges list with ESPN pool and reports unmatched', () => {
  const { board } = fixture();
  assert.equal(board.players.length, 7);
  assert.deepEqual(board.unmatched, ['Foxtrot Six']);
  const alpha = board.byKey.get('e101');
  assert.equal(alpha.myRank, 1);
  assert.equal(alpha.fppg, 25);
  assert.equal(board.players[6].name, 'Golf Seven');
  assert.equal(board.players[6].onList, false);
  assert.equal(board.byKey.get('n:foxtrot six').tier, 3);
});

test('computeDraft from ESPN picks: my team, timing, no double counting', () => {
  const { board } = fixture();
  const picks = [
    { overall: 1, teamId: 7, espnId: 102 },
    { overall: 2, teamId: 3, espnId: 101 },
    { overall: 2, teamId: 3, espnId: 101 }, // duplicate refresh payload
    { overall: 3, teamId: 5, espnId: 999 }, // unknown player
  ];
  const d = HDA.computeDraft({ board, picks, teams: 4, rounds: 3, myTeamId: 3, pickOrder: [7, 3, 5, 9] });
  assert.equal(d.mySlot, 2);
  assert.equal(d.drafted.size, 2);
  assert.equal(d.unresolved.length, 1);
  assert.equal(d.myPlayers.length, 1);
  assert.equal(d.myPlayers[0].name, 'Alpha One');
  assert.equal(d.currentPick, 4);
  assert.deepEqual(d.myPickNumbers, [2, 7, 10]);
  assert.equal(d.myNextPick, 7);
  assert.equal(d.picksAway, 3);
  assert.equal(d.onClock, false);
});

test('computeDraft manual mode: slot-based ownership + overrides', () => {
  const { board } = fixture();
  const picks = [{ overall: 1, key: 'e102' }, { overall: 2, name: 'Alpha One' }];
  const d = HDA.computeDraft({ board, picks, teams: 4, rounds: 3, mySlot: 2, mineOverrides: { e102: true } });
  assert.equal(d.drafted.get('e101').mine, true);
  assert.equal(d.drafted.get('e102').mine, true, 'override wins');
  assert.equal(d.onClock, false);
  const d2 = HDA.computeDraft({ board, picks: picks.slice(0, 1), teams: 4, rounds: 3, mySlot: 2 });
  assert.equal(d2.onClock, true);
  assert.equal(d2.myFollowingPick, 7);
});

test('computeDraft marks complete drafts', () => {
  const { board } = fixture();
  const picks = [101, 102, 103, 104].map((id, i) => ({ overall: i + 1, espnId: id }));
  const d = HDA.computeDraft({ board, picks, teams: 2, rounds: 2, mySlot: 1 });
  assert.equal(d.complete, true);
  assert.equal(d.myNextPick, null);
});

test('dedicatedSlotsFilled uses matching, not greedy assignment', () => {
  const slots = { PG: 1, G: 1, C: 1, UTIL: 2 };
  // A PG/SG guard and a PG: greedy could put the dual guard at PG and strand the PG.
  assert.equal(HDA.dedicatedSlotsFilled(slots, [['PG', 'SG'], ['PG']]).filled, 2);
  const r = HDA.dedicatedSlotsFilled(slots, [['C'], ['C']]);
  assert.equal(r.filled, 1);
  assert.deepEqual(r.open.sort(), ['G', 'PG']);
  assert.equal(HDA.dedicatedSlotsFilled(slots, []).filled, 0);
});

test('probGoneBefore is monotone and conditional on availability', () => {
  const a = HDA.probGoneBefore(10, 5, 8);
  const b = HDA.probGoneBefore(10, 5, 20);
  assert.ok(a < b);
  assert.ok(HDA.probGoneBefore(40, 5, 8) < 0.05, 'late ADP survives');
  assert.ok(HDA.probGoneBefore(3, 20, 25) > 0.6, 'faller past ADP goes soon');
  assert.equal(HDA.probGoneBefore(null, 1, 10), null);
  assert.equal(HDA.probGoneBefore(10, 8, 8), 0);
});

test('suggest follows the list order exactly, with notes only', () => {
  const { board } = fixture();
  // Bravo (PG) and Alpha (C) gone; I own Alpha. Slots need a PG.
  const d = HDA.computeDraft({ board, picks: [{ overall: 1, espnId: 102 }, { overall: 2, espnId: 101 }], teams: 4, rounds: 3, mySlot: 2 });
  const s = HDA.suggest({ board, draft: d, rosterSlots: { PG: 1, C: 1, F: 1, UTIL: 1 } });
  const names = s.suggestions.map((x) => x.player.name);
  assert.deepEqual(names, ['Charlie Three', 'Delta Four', 'Echo Five', 'Foxtrot Six'], 'never reordered, off-list excluded');
  const delta = s.suggestions[1];
  assert.ok(delta.notes.some((n) => n.kind === 'status' && /out/.test(n.text)), 'OUT is a note, not a demotion');
  assert.ok(s.suggestions[3].notes.some((n) => /Last one left in Tier 3/.test(n.text)));
  assert.ok(s.suggestions[0].notes.some((n) => n.kind === 'need'));
  assert.equal(s.rosterFit.filled, 1);
});

test('suggest DR hint: top DR player likely there next turn -> point at next non-DR', () => {
  const rankings = HDA.parseRankings('Tier 1\nSleeper Pick | DR\nStar Guy\nOther Guy').players;
  const espnPlayers = [
    { espnId: 1, name: 'Sleeper Pick', pos: ['C'], adp: 60 },
    { espnId: 2, name: 'Star Guy', pos: ['PG'], adp: 4 },
    { espnId: 3, name: 'Other Guy', pos: ['SF'], adp: 8 },
  ];
  const board = HDA.buildBoard({ rankings, espnPlayers });
  const d = HDA.computeDraft({ board, picks: [], teams: 10, rounds: 5, mySlot: 1 });
  const s = HDA.suggest({ board, draft: d });
  assert.equal(s.suggestions[0].player.name, 'Sleeper Pick', 'still #1 — order is law');
  assert.ok(s.drHint);
  assert.equal(s.drHint.alt.name, 'Star Guy');
  assert.equal(s.drHint.nextTurn, 20);
});

test('parseRankings reads * and DR from pasted spreadsheet cells', () => {
  const { players } = HDA.parseRankings('Nikola Jokic\t\nVictor Wembanyama*\t\nJosh Giddey\tDR\nJaren Jackson Jr.\tDon\'t Reach (DR)');
  assert.deepEqual(players.map((p) => p.name), ['Nikola Jokic', 'Victor Wembanyama', 'Josh Giddey', 'Jaren Jackson Jr.']);
  assert.equal(players[1].injuryProne, true);
  assert.equal(players[2].dontReach, true);
  assert.equal(players[3].dontReach, true);
  assert.equal(players[0].dontReach, undefined);
});

test('suggest handles an empty pool and no list', () => {
  const board = HDA.buildBoard({ rankings: [], espnPlayers: [] });
  const d = HDA.computeDraft({ board, picks: [], teams: 10, rounds: 13, mySlot: 1 });
  const s = HDA.suggest({ board, draft: d });
  assert.deepEqual(s.suggestions, []);
  assert.equal(d.onClock, true);
});

test('tiers groups list players with drafted/mine flags', () => {
  const { board } = fixture();
  const d = HDA.computeDraft({ board, picks: [{ overall: 1, espnId: 101 }], teams: 4, rounds: 3, mySlot: 1 });
  const t = HDA.tiers(board, d);
  assert.deepEqual(t.map((g) => g.tier), [1, 2, 3]);
  assert.equal(t[0].left, 1);
  assert.equal(t[0].players[0].mine, true);
});
