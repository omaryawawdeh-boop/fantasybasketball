// Health risk, games played parsing, and the full-draft plan. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');

test('healthRisk combines *, games played, age and ESPN status', () => {
  assert.equal(HDA.healthRisk({}).level, 'low');
  assert.equal(HDA.healthRisk({ injuryProne: true }).level, 'med');
  assert.equal(HDA.healthRisk({ injuryProne: true, gamesLastSeason: 40 }).level, 'high');
  assert.equal(HDA.healthRisk({ gamesLastSeason: 55 }).level, 'low');
  assert.equal(HDA.healthRisk({ gamesLastSeason: 30 }).level, 'med');
  assert.equal(HDA.healthRisk({ age: 39 }).level, 'med');
  assert.equal(HDA.healthRisk({ injury: 'OUT' }).level, 'high');
  assert.deepEqual(HDA.healthRisk({ injuryProne: true, gamesLastSeason: 40, age: 36 }).reasons, ['injury prone (*)', '40 games last season', 'age 36']);
});

test('team risk cap: a 4th risky player is flagged bad, a healthy one is not', () => {
  const risky = [1, 2, 3].map((i) => ({ key: 'r' + i, name: 'R' + i, pos: ['SF'], injuryProne: true }));
  const prof = HDA.teamProfile({ myPlayers: risky, rounds: 13 });
  assert.equal(prof.risky.length, 3);
  assert.equal(HDA.assessFit({ name: 'Glass', pos: ['C'], gamesLastSeason: 30 }, prof).bad, true);
  assert.equal(HDA.assessFit({ name: 'Iron', pos: ['C'], gamesLastSeason: 80 }, prof).bad, false);
  // Old setting name (maxProne) still respected.
  assert.equal(HDA.teamProfile({ myPlayers: [], rounds: 13, fit: { maxProne: 1 } }).cfg.maxRisky, 2);
});

test('parsePlayers reads games played from last season totals', () => {
  const [p] = HDA.parsePlayers([{ id: 1, fullName: 'X Y', stats: [
    { seasonId: 2026, statSourceId: 0, statSplitTypeId: 0, stats: { 42: 36 }, averageStats: { 0: 20 } },
    { seasonId: 2027, statSourceId: 1, statSplitTypeId: 0, averageStats: { 0: 21 } },
  ] }], 2027);
  assert.equal(p.gamesLastSeason, 36);
  const [q] = HDA.parsePlayers([{ id: 2, fullName: 'No Stats' }], 2027);
  assert.equal(q.gamesLastSeason, null);
});

function league(slot, picks = []) {
  const pos = [['C'], ['PG'], ['SF', 'PF'], ['C'], ['SG'], ['PF'], ['PG', 'SG'], ['SF'], ['C'], ['PF', 'C']];
  const rankings = HDA.parseRankings(Array.from({ length: 220 }, (_, i) => `Player ${i + 1}x`).join('\n')).players;
  const espnPlayers = rankings.map((r, i) => ({ espnId: i + 1, name: r.name, pos: pos[i % pos.length], adp: i + 1 }));
  const board = HDA.buildBoard({ rankings, espnPlayers });
  const draft = HDA.computeDraft({ board, picks: picks.map((id, i) => ({ overall: i + 1, espnId: id })), teams: 14, rounds: 13, mySlot: slot });
  return { board, draft };
}

test('pick 4 in a 14-team snake: 13 picks, plan covers all of them', () => {
  const { board, draft } = league(4);
  assert.deepEqual(draft.myPickNumbers, [4, 25, 32, 53, 60, 81, 88, 109, 116, 137, 144, 165, 172]);
  const odds = HDA.availabilityOdds({ board, draft, sims: 600, horizons: 13 });
  assert.deepEqual(odds.targets, draft.myPickNumbers);
  const plan = HDA.draftPlan({ board, draft, odds });
  assert.equal(plan.rows.length, 13);
  assert.ok(plan.rows.every((r) => r.player), 'a player planned at every pick');
  assert.ok(plan.rows.every((r) => r.chance == null || r.chance >= 0.5), 'only players likely to be there');
  assert.equal(new Set(plan.rows.map((r) => r.player.key)).size, 13, 'no player planned twice');
  // Picks are in order and realistic: the plan never assumes a top-3 ADP player lasts to #25.
  assert.ok(plan.rows[1].player.adp > 15);
  // Balanced result: no group more than 1.5 over its target.
  const { counts, targets } = plan.profile;
  for (const b of ['G', 'F', 'C']) assert.ok(counts[b] <= targets[b] + 1.5, `${b}: ${counts[b]} vs ${targets[b]}`);
});

test('plan re-plans from the live board (on the clock -> includes this pick)', () => {
  const { board, draft } = league(4, [1, 2, 3]);
  assert.equal(draft.onClock, true);
  const odds = HDA.availabilityOdds({ board, draft, sims: 400, horizons: 13 });
  const plan = HDA.draftPlan({ board, draft, odds });
  assert.equal(plan.rows[0].pick, 4);
  assert.equal(plan.rows.length, 13);
  assert.ok(!plan.rows.some((r) => [1, 2, 3].includes(r.player.espnId)), 'never plans a drafted player');
});
