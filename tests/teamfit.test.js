// Team fit: positional balance, age, health. Synthetic players only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');

const P = (name, pos, extra = {}) => ({ key: 'n:' + name, name, pos, ...extra });
const profileOf = (mine, rounds = 13, fit) => HDA.teamProfile({ myPlayers: mine, rounds, fit });

test('bucket fractions split multi-position players', () => {
  assert.deepEqual(HDA.bucketFractions(['PG', 'SG']), { G: 1, F: 0, C: 0 });
  assert.deepEqual(HDA.bucketFractions(['PF', 'C']), { G: 0, F: 0.5, C: 0.5 });
  const b = HDA.bucketFractions(['PG', 'SG', 'SF']);
  assert.ok(Math.abs(b.G - 2 / 3) < 1e-9 && Math.abs(b.F - 1 / 3) < 1e-9);
});

test('targets add up to the roster size (13 -> 5 G / 5 F / 3 C)', () => {
  assert.deepEqual(HDA.balanceTargets(13), { G: 5, F: 5, C: 3 });
  const t = HDA.balanceTargets(10);
  assert.equal(t.G + t.F + t.C, 10);
});

test('too many forwards: the top forward is flagged bad, a center/guard is preferred', () => {
  const mine = ['A', 'B', 'C', 'D', 'E'].map((n) => P('F' + n, ['SF', 'PF']));
  const prof = profileOf(mine);
  const fwd = HDA.assessFit(P('Top Forward', ['SF', 'PF']), prof);
  assert.equal(fwd.bad, true);
  assert.match(fwd.flags[0].text, /Too many forwards: you have 5 \(target 5\)/);
  const pick = HDA.teamFitPick({ candidates: [P('Top Forward', ['SF', 'PF']), P('Second Forward', ['PF']), P('Good Center', ['C'])], profile: prof });
  assert.equal(pick.top.player.name, 'Top Forward');
  assert.equal(pick.instead.player.name, 'Good Center');
});

test('balanced team: no "draft instead" when your #1 fits', () => {
  const mine = [P('G1', ['PG']), P('F1', ['SF']), P('C1', ['C'])];
  const pick = HDA.teamFitPick({ candidates: [P('Wing', ['SG', 'SF']), P('Big', ['C'])], profile: profileOf(mine) });
  assert.equal(pick.instead, null);
});

test('needs: late in the draft with no centers, a center is flagged as needed', () => {
  const mine = ['1', '2', '3', '4', '5'].map((n) => P('G' + n, ['PG'])).concat(['1', '2', '3', '4', '5'].map((n) => P('F' + n, ['SF'])));
  const prof = profileOf(mine); // 10 picks, 3 left, 0 of 3 centers
  const c = HDA.assessFit(P('Big', ['C']), prof);
  assert.ok(c.flags.some((f) => f.kind === 'good' && /You need centers/.test(f.text)));
  const pick = HDA.teamFitPick({ candidates: [P('Guard', ['PG']), P('Big', ['C'])], profile: prof });
  assert.equal(pick.instead.player.name, 'Big');
});

test('age: with 2 players 35+, a third is flagged bad and a younger player is suggested', () => {
  const mine = [P('Vet1', ['PG'], { age: 38 }), P('Vet2', ['SF'], { age: 36 }), P('Kid', ['C'], { age: 22 })];
  const prof = profileOf(mine);
  const old = HDA.assessFit(P('Old Star', ['SG'], { age: 37 }), prof);
  assert.equal(old.bad, true);
  assert.match(old.flags.find((f) => /Age/.test(f.text)).text, /already have 2 players 35\+/);
  const pick = HDA.teamFitPick({ candidates: [P('Old Star', ['SG'], { age: 37 }), P('Young Guard', ['SG'], { age: 24 })], profile: prof });
  assert.equal(pick.instead.player.name, 'Young Guard');
  // One vet on the team: a second is only a mild warning, and with a custom max of 1 it's bad.
  const one = profileOf([P('Vet1', ['PG'], { age: 38 })]);
  assert.equal(HDA.assessFit(P('Old', ['SG'], { age: 36 }), one).bad, false);
  assert.equal(HDA.assessFit(P('Old', ['SG'], { age: 36 }), profileOf([P('Vet1', ['PG'], { age: 38 })], 13, { maxOld: 1 })).bad, true);
});

test('health: too many injury-prone players, and ESPN OUT status', () => {
  const mine = [P('Fragile1', ['PG'], { injuryProne: true }), P('Fragile2', ['SF'], { injuryProne: true }), P('Fragile3', ['C'], { injuryProne: true })];
  const prone = HDA.assessFit(P('Glass', ['SF'], { injuryProne: true }), profileOf(mine));
  assert.equal(prone.bad, true);
  const out = HDA.assessFit(P('Hurt', ['SF'], { injury: 'OUT' }), profileOf([]));
  assert.equal(out.bad, true);
});

test('list order still matters: a small fit edge does not override a big ranking gap', () => {
  const mine = [P('G1', ['PG']), P('G2', ['SG'])];
  const cands = [P('Best Guard', ['PG'])].concat(Array.from({ length: 10 }, (_, i) => P('Filler' + i, ['SG']))).concat([P('Deep Center', ['C'])]);
  const pick = HDA.teamFitPick({ candidates: cands, profile: profileOf(mine) });
  assert.equal(pick.instead, null, 'two guards on a 13-man roster is fine; keep your #1');
});

test('suggest() exposes the team profile and fit pick from real draft state', () => {
  const rankings = HDA.parseRankings('Tier 1\nFwd One\nFwd Two\nFwd Three\nFwd Four\nFwd Five\nFwd Six\nCenter Guy').players;
  const espnPlayers = rankings.map((r, i) => ({ espnId: i + 1, name: r.name, pos: r.name.startsWith('Fwd') ? ['SF', 'PF'] : ['C'], adp: i + 1 }));
  const board = HDA.buildBoard({ rankings, espnPlayers });
  const picks = [1, 2, 3, 4, 5].map((id, i) => ({ overall: i + 1, espnId: id }));
  const draft = HDA.computeDraft({ board, picks, teams: 1, rounds: 13, mySlot: 1 });
  const s = HDA.suggest({ board, draft });
  assert.equal(s.suggestions[0].player.name, 'Fwd Six', 'list order unchanged');
  assert.equal(s.fitPick.instead.player.name, 'Center Guy');
  assert.equal(Math.round(s.profile.counts.F), 5);
});
