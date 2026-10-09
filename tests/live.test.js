// Live draft-room parsing and pick merging. Synthetic frames only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');
require('../extension/core/live-picks.js');

test('parseLiveFrame reads text pick commands', () => {
  const known = new Set([4066261, 3112335]);
  const picks = HDA.parseLiveFrame('CLOCK 4 30000\nSELECTED 3 4066261 {ABC-123}\nSELECTED 4 3112335 {DEF}', known);
  assert.deepEqual(picks.map((p) => [p.teamId, p.espnId]), [[3, 4066261], [4, 3112335]]);
});

test('parseLiveFrame ignores suggestions, queues, unknown ids', () => {
  const known = new Set([4066261]);
  assert.deepEqual(HDA.parseLiveFrame('AUTOSUGGEST 3 4066261', known), []);
  assert.deepEqual(HDA.parseLiveFrame('QUEUE 3 4066261', known), []);
  assert.deepEqual(HDA.parseLiveFrame('SELECTED 3 999999 {x}', known), []);
  assert.deepEqual(HDA.parseLiveFrame('PING', known), []);
  assert.deepEqual(HDA.parseLiveFrame(null, known), []);
});

test('parseLiveFrame reads JSON pick objects at any depth', () => {
  const frame = JSON.stringify({ type: 'draft', data: { picks: [{ overallPickNumber: 7, teamId: 2, playerId: 55, roundId: 1 }, { playerId: 66 }] } });
  const picks = HDA.parseLiveFrame(frame, new Set([55, 66]));
  assert.deepEqual(picks, [{ teamId: 2, espnId: 55, overall: 7, source: 'live' }]);
});

test('mergePicks: union by player, extras numbered after known picks', () => {
  const base = [{ overall: 1, espnId: 10, teamId: 1 }, { overall: 2, espnId: 11, teamId: 2 }];
  const extras = [
    { espnId: 11, teamId: 2 },          // already in base -> skipped
    { key: 'e12', espnId: 12, teamId: 3 },
    { key: 'n:some guy' },
    { espnId: 13, overall: 2 },         // pick number collides -> renumbered
  ];
  const m = HDA.mergePicks(base, extras);
  assert.deepEqual(m.map((p) => [p.overall, HDA.pickKey(p)]), [[1, 'e10'], [2, 'e11'], [3, 'e12'], [4, 'n:some guy'], [5, 'e13']]);
});

test('ESPN data empty + live picks -> crossed off, my pick via teamId, clock advances', () => {
  const rankings = HDA.parseRankings('Tier 1\nA One\nB Two\nC Three').players;
  const espnPlayers = [1, 2, 3].map((i) => ({ espnId: i, name: ['A One', 'B Two', 'C Three'][i - 1], pos: ['C'] }));
  const board = HDA.buildBoard({ rankings, espnPlayers });
  const picks = HDA.mergePicks([], [{ espnId: 1, teamId: 1 }, { key: 'e2', source: 'page' }]);
  const d = HDA.computeDraft({ board, picks, teams: 4, rounds: 3, myTeamId: 2, pickOrder: [1, 2, 3, 4] });
  assert.equal(d.drafted.size, 2);
  assert.equal(d.currentPick, 3);
  assert.equal(d.drafted.get('e2').mine, true, 'no teamId -> slot math says pick 2 is mine');
});
