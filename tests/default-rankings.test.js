// Guards the user's own board: order must match data/omar-rankings.csv exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HDA = require('./load-core');
require('../extension/data/default-rankings.js');

const csv = fs.readFileSync(path.join(__dirname, '../data/omar-rankings.csv'), 'utf8');
const def = HDA.DEFAULT_RANKINGS;
const rankOf = (n) => (def.find((p) => p.name === n) || {}).rank;

test('built-in board = the list edited in the extension (Oct 14) + Mara and Stirtz', () => {
  const parsed = HDA.parseRankings(csv);
  assert.equal(HDA.DEFAULT_RANKINGS_VERSION, 'My edits (Oct 14)');
  assert.equal(def.length, 180);
  assert.deepEqual(parsed.players.map((p) => p.name), def.map((p) => p.name));
  assert.deepEqual(parsed.players.map((p) => p.tier), def.map((p) => p.tier));
  // Spot checks from the pasted list.
  assert.deepEqual(def.slice(0, 6).map((p) => p.name), ['Nikola Jokic', 'Luka Doncic', 'Victor Wembanyama', 'Shai Gilgeous-Alexander', 'Giannis Antetokounmpo', 'Cade Cunningham']);
  assert.equal(rankOf('Deni Avdija'), 20);
  assert.equal(rankOf('Kevin Porter Jr.'), 61);
  assert.equal(rankOf('Scoot Henderson'), 136);
  assert.equal(def[def.length - 1].name, 'Dereck Lively II');
  // Tier sizes from the pasted list, plus the two rookies in tier 12.
  const sizes = {};
  for (const p of def) sizes[p.tier] = (sizes[p.tier] || 0) + 1;
  assert.deepEqual(Object.values(sizes), [2, 4, 6, 7, 11, 12, 15, 15, 16, 23, 25, 44]);
  assert.equal(HDA.DEFAULT_TIER_LABELS[12], 'Deep bench and stashes');
  assert.equal(def.filter((p) => p.dontReach).length, 10);
  assert.equal(def.filter((p) => p.injuryProne).length, 22);
  assert.equal(def.find((p) => p.name === 'Chet Holmgren').dontReach, true);
  assert.equal(def.find((p) => p.name === 'Chet Holmgren').injuryProne, true);
});

test('Mara and Stirtz sit right before their anchors, flagged as rookies', () => {
  assert.equal(rankOf('Aday Mara') + 1, rankOf('Isaiah Collier'));
  assert.equal(rankOf('Bennett Stirtz') + 1, rankOf('Jaden Ivey'));
  for (const n of ['Aday Mara', 'Bennett Stirtz']) {
    const p = def.find((x) => x.name === n);
    assert.equal(p.rookie, true);
    assert.equal(p.tier, 12);
    assert.match(p.note, /Added by Claude/);
  }
});

test('one-time migration adds the extras to an edited list, by anchor, without duplicates', () => {
  const edited = def.filter((p) => !['Aday Mara', 'Bennett Stirtz'].includes(p.name)).map((p) => ({ ...p }));
  // Simulate an edited list where Isaiah Collier was moved up to #20.
  let cur = HDA.rankEdit.moveTo(edited, {}, edited.findIndex((p) => p.name === 'Isaiah Collier') + 1, 20);
  for (const e of HDA.DEFAULT_EXTRA_PLAYERS) cur = HDA.rankEdit.insertBefore(cur.players, cur.tierLabels, e, e.before);
  const at = (n) => cur.players.findIndex((p) => p.name === n);
  assert.equal(at('Aday Mara') + 1, at('Isaiah Collier'), 'follows the anchor wherever it was moved');
  assert.equal(cur.players[at('Aday Mara')].tier, cur.players[at('Isaiah Collier')].tier);
  const again = HDA.rankEdit.insertBefore(cur.players, cur.tierLabels, HDA.DEFAULT_EXTRA_PLAYERS[0], 'Isaiah Collier');
  assert.equal(again.players.length, cur.players.length, 'no duplicate');
});

test('default board suggests Jokic first on an empty draft', () => {
  const board = HDA.buildBoard({ rankings: HDA.DEFAULT_RANKINGS });
  const L = HDA.DEFAULT_LEAGUE;
  const d = HDA.computeDraft({ board, picks: [], teams: L.teams, rounds: L.rounds, mySlot: 5 });
  const s = HDA.suggest({ board, draft: d, rosterSlots: L.rosterSlots });
  assert.equal(s.suggestions[0].player.name, 'Nikola Jokic');
});

test('tier sheet stats attach by name (last season FP/G, games) when ESPN is not loaded', () => {
  const board = HDA.buildBoard({ rankings: HDA.DEFAULT_RANKINGS });
  const jokic = board.byKey.get('n:nikola jokic');
  assert.equal(jokic.fppgLast, 58.9);
  assert.equal(jokic.fppgLastSource, 'tier sheet');
  assert.equal(jokic.gamesLastSeason, 65);
  assert.equal(board.byKey.get('n:aday mara').fppgLast, null, 'rookie: no last season');
});
