// Guards the user's own board: order must match data/omar-rankings.csv exactly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HDA = require('./load-core');
require('../extension/data/default-rankings.js');

test('default rankings = CSV order (Ranking 14), 178 players, flags intact', () => {
  const csv = fs.readFileSync(path.join(__dirname, '../data/omar-rankings.csv'), 'utf8');
  const parsed = HDA.parseRankings(csv);
  const def = HDA.DEFAULT_RANKINGS;
  assert.equal(def.length, 178);
  assert.equal(HDA.DEFAULT_RANKINGS_VERSION, 'Ranking 14');
  assert.deepEqual(parsed.players.map((p) => p.name), def.map((p) => p.name));
  assert.deepEqual(parsed.players.map((p) => p.tier), def.map((p) => p.tier));
  assert.deepEqual(def.slice(0, 4).map((p) => p.name), ['Nikola Jokic', 'Luka Doncic', 'Victor Wembanyama', 'Shai Gilgeous-Alexander']);
  assert.deepEqual(def.filter((p) => p.dontReach).map((p) => p.rank), [13, 15, 29, 43, 46, 47, 48, 54, 56, 64]);
  assert.equal(def.filter((p) => p.injuryProne).length, 22);
  assert.equal(parsed.players.filter((p) => p.dontReach).length, 10);
  assert.equal(def[177].name, 'Dereck Lively II');
  // Ranking 11
  const rankOf = (n) => def.find((p) => p.name === n).rank;
  assert.equal(rankOf('Stephen Curry'), 34);
  assert.equal(rankOf('Walker Kessler'), 54);
  assert.equal(rankOf('Payton Pritchard'), 87);
  assert.equal(rankOf('Bones Hyland'), 160);
  assert.equal(rankOf('Jerami Grant'), 136);
  assert.equal(rankOf('Draymond Green'), 114);
  assert.equal(rankOf('Tre Jones'), 115);
  assert.ok(!def.some((p) => p.name === 'Cam Thomas' || p.name === "D'Angelo Russell" || p.name === 'Mark Williams'));
  assert.equal(rankOf('Domantas Sabonis'), 37, 'typo fixed (Domantis)');
  assert.equal(rankOf('Isaiah Collier'), 149, 'typo fixed (Isiah)');
  assert.equal(def.find((p) => p.name === 'Cameron Boozer').rookie, true, 'metadata follows the player, not the row');
});

test('default board suggests Jokic first on an empty draft', () => {
  const board = HDA.buildBoard({ rankings: HDA.DEFAULT_RANKINGS });
  const L = HDA.DEFAULT_LEAGUE;
  const d = HDA.computeDraft({ board, picks: [], teams: L.teams, rounds: L.rounds, mySlot: 5 });
  const s = HDA.suggest({ board, draft: d, rosterSlots: L.rosterSlots });
  assert.equal(s.suggestions[0].player.name, 'Nikola Jokic');
  assert.deepEqual(d.myPickNumbers.slice(0, 3), [5, 24, 33]);
});
