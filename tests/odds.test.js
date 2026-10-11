// Availability odds (Monte Carlo). Synthetic ADPs only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');

function setup({ teams = 14, rounds = 13, mySlot = 5, drafted = [] } = {}) {
  const espnPlayers = Array.from({ length: 300 }, (_, i) => ({ espnId: i + 1, name: `Player ${String.fromCharCode(65 + (i % 26))}${i}`, pos: ['C'], adp: i + 1 }));
  const board = HDA.buildBoard({ rankings: [], espnPlayers });
  const picks = drafted.map((id, i) => ({ overall: i + 1, espnId: id }));
  const draft = HDA.computeDraft({ board, picks, teams, rounds, mySlot });
  return { board, draft };
}

test('targets are your next three turns (skipping the pick you are on)', () => {
  const a = HDA.availabilityOdds(setup({ mySlot: 5 }));
  assert.deepEqual(a.targets, [5, 24, 33]);
  const onClock = HDA.availabilityOdds(setup({ mySlot: 1 }));
  assert.deepEqual(onClock.targets, [28, 29, 56], 'on the clock at #1 -> next turns are 28, 29, 56');
});

test('odds fall across horizons, and later ADP means safer', () => {
  const { odds } = HDA.availabilityOdds(setup({ mySlot: 5, drafted: [1, 2] }));
  const p = (id) => odds.get('e' + id);
  for (const id of [5, 20, 30, 45]) {
    const [a, b, c] = p(id);
    assert.ok(a >= b && b >= c, `monotone for ADP ${id}: ${a} ${b} ${c}`);
  }
  assert.ok(p(3)[0] < 0.25, 'ADP 3 rarely lasts to pick 5');
  assert.ok(p(60)[0] > 0.97, 'ADP 60 is safe for pick 5');
  assert.ok(p(24)[1] > 0.25 && p(24)[1] < 0.85, `ADP 24 is a coin flip-ish at pick 24 (${p(24)[1]})`);
  assert.ok(p(30)[1] > 0.9, 'ADP 30 is safe at pick 24 with 21 picks before it');
  assert.ok(p(200)[2] > 0.99);
});

test('odds react to the actual board: reaches leave better players to soak up picks', () => {
  // Same 3 picks made, by ADP (1-3) vs reaches (ADP 40-42). After the reaches, 1-3 are
  // still ahead of ADP 22 in line and absorb picks, so he is MORE likely to last.
  const chalk = HDA.availabilityOdds(setup({ mySlot: 5, drafted: [1, 2, 3] })).odds.get('e22')[1];
  const reach = HDA.availabilityOdds(setup({ mySlot: 5, drafted: [40, 41, 42] })).odds.get('e22')[1];
  assert.ok(reach > chalk + 0.1, `ADP 22 at pick 24: ${reach} after reaches vs ${chalk} after chalk picks`);
  // And a player drafted is gone from the odds entirely.
  assert.equal(HDA.availabilityOdds(setup({ mySlot: 5, drafted: [22] })).odds.has('e22'), false);
});

test('accuracy check vs closed form for a single slot', () => {
  // With one pick before your turn, P(player with ADP a survives) = P(someone else is drafted first).
  const { board, draft } = setup({ teams: 2, rounds: 3, mySlot: 2 });
  const a = HDA.availabilityOdds({ board, draft, sims: 4000 });
  assert.deepEqual(a.targets, [2, 3, 6]);
  const top = a.odds.get('e1')[0];
  assert.ok(top > 0.1 && top < 0.45, `ADP 1 vs ADP 2 head-to-head for one pick: ${top}`);
  assert.ok(a.odds.get('e30')[0] > 0.999);
});

test('deterministic (no flicker between redraws) and fast enough for a live draft', () => {
  const s = setup({ mySlot: 7, drafted: [1, 2, 3, 4] });
  const t0 = Date.now();
  const a = HDA.availabilityOdds(s);
  const ms = Date.now() - t0;
  const b = HDA.availabilityOdds(s);
  assert.deepEqual([...a.odds.entries()].slice(0, 20), [...b.odds.entries()].slice(0, 20));
  assert.ok(ms < 1500, `took ${ms}ms`);
});

test('no ADP -> no odds; complete draft -> no targets', () => {
  const board = HDA.buildBoard({ rankings: HDA.parseRankings('A Guy\nB Guy').players });
  const draft = HDA.computeDraft({ board, picks: [], teams: 10, rounds: 2, mySlot: 3 });
  const a = HDA.availabilityOdds({ board, draft });
  assert.deepEqual(a.targets, [3, 18]);
  assert.deepEqual(a.odds.get('n:a guy'), [null, null]);
  const done = HDA.availabilityOdds(setup({ teams: 2, rounds: 1, mySlot: 1, drafted: [1, 2] }));
  assert.deepEqual(done.targets, []);
});
