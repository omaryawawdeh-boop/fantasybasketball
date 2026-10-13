// Editing the rankings list. Synthetic names only.
const test = require('node:test');
const assert = require('node:assert/strict');
const HDA = require('./load-core');
const E = HDA.rankEdit;

const L = () => [['A1', 1], ['A2', 1], ['B1', 2], ['B2', 2], ['B3', 2], ['C1', 3], ['C2', 3]].map(([name, tier], i) => ({ rank: i + 1, name, tier }));
const labels = { 1: 'Top', 2: 'Mid' };
const names = (r) => r.players.map((p) => p.name).join(' ');
const tiers = (r) => r.players.map((p) => p.tier).join('');

test('move within a tier keeps the tier; ranks renumber', () => {
  const r = E.moveTo(L(), labels, 5, 3); // B3 -> top of tier 2
  assert.equal(names(r), 'A1 A2 B3 B1 B2 C1 C2');
  assert.equal(tiers(r), '1122233');
  assert.deepEqual(r.players.map((p) => p.rank), [1, 2, 3, 4, 5, 6, 7]);
});

test('moving across tiers joins the tier he lands in', () => {
  const r = E.moveTo(L(), labels, 6, 2); // C1 up between A1 and A2 -> tier 1
  assert.equal(names(r), 'A1 C1 A2 B1 B2 B3 C2');
  assert.equal(tiers(r), '1112223');
  const down = E.moveTo(L(), labels, 1, 7); // A1 to the bottom -> tier 3
  assert.equal(down.players[6].name, 'A1');
  assert.equal(down.players[6].tier, 3);
});

test('moveBy one spot, and clamps at the ends', () => {
  assert.equal(names(E.moveBy(L(), labels, 2, -1)), 'A2 A1 B1 B2 B3 C1 C2');
  assert.equal(names(E.moveBy(L(), labels, 1, -1)), 'A1 A2 B1 B2 B3 C1 C2');
  assert.equal(names(E.moveBy(L(), labels, 7, +5)), 'A1 A2 B1 B2 B3 C1 C2');
});

test('changeTier: up = last of tier above, down = first of tier below', () => {
  const up = E.changeTier(L(), labels, 3, -1); // B1 -> end of tier 1
  assert.equal(names(up), 'A1 A2 B1 B2 B3 C1 C2');
  assert.equal(tiers(up), '1112233');
  const down = E.changeTier(L(), labels, 2, +1); // A2 -> start of tier 2
  assert.equal(tiers(down), '1222233');
  const newLast = E.changeTier(L(), labels, 7, +1); // C2 -> new tier 4
  assert.equal(tiers(newLast), '1122234');
});

test('emptying a tier closes the gap and keeps labels lined up', () => {
  let r = { players: L(), tierLabels: labels };
  r = E.changeTier(r.players, r.tierLabels, 1, +1); // A1 -> tier 2
  r = E.changeTier(r.players, r.tierLabels, 1, +1); // A2 -> tier 2 (tier 1 now empty)
  assert.equal(tiers(r), '1111122');
  assert.equal(r.tierLabels[1], 'Mid');
});

test('split and merge tiers, labels shift with them', () => {
  const s = E.splitTier(L(), labels, 4); // new tier starts at B2
  assert.equal(tiers(s), '1123344');
  assert.deepEqual(s.tierLabels, { 1: 'Top', 2: 'Mid' });
  assert.equal(tiers(E.splitTier(L(), labels, 3)), '1122233');
  const m = E.mergeTier(L(), labels, 2);
  assert.equal(tiers(m), '1111122');
  assert.deepEqual(m.tierLabels, { 1: 'Top' });
});

test('drag onto a tier header puts him first in that tier', () => {
  const r = HDA.rankEdit.moveToTierStart(L(), labels, 1, 2); // A1 -> top of tier 2
  assert.equal(names(r), 'A2 A1 B1 B2 B3 C1 C2');
  assert.equal(tiers(r), '1222233');
  const up = HDA.rankEdit.moveToTierStart(L(), labels, 7, 1); // C2 -> top of tier 1
  assert.equal(names(up), 'C2 A1 A2 B1 B2 B3 C1');
  assert.equal(tiers(up), '1112223');
});

test('flags, remove, insert, rename', () => {
  const f = E.toggleFlag(L(), labels, 2, 'dontReach');
  assert.equal(f.players[1].dontReach, true);
  assert.equal(E.toggleFlag(f.players, labels, 2, 'dontReach').players[1].dontReach, undefined);
  assert.equal(E.toggleFlag(L(), labels, 1, 'injuryProne').players[0].injuryProne, true);
  const rm = E.removeAt(L(), labels, 3);
  assert.equal(names(rm), 'A1 A2 B2 B3 C1 C2');
  const ins = E.insertAt(L(), labels, { name: 'New Guy', pos: ['C'] }, 3);
  assert.equal(names(ins), 'A1 A2 New Guy B1 B2 B3 C1 C2');
  assert.equal(ins.players[2].tier, 1, 'joins the tier above where he lands');
  assert.equal(E.insertAt(L(), labels, { name: 'Bottom' }).players[7].tier, 3);
  assert.equal(E.insertAt(L(), labels, { name: 'a1' }).players.length, 7, 'no duplicates');
  assert.deepEqual(E.renameTier(L(), labels, 3, ' Sleepers ').tierLabels, { 1: 'Top', 2: 'Mid', 3: 'Sleepers' });
});

test('edits feed straight into suggestions', () => {
  const r = E.moveTo(L(), labels, 6, 1); // C1 to #1
  const board = HDA.buildBoard({ rankings: r.players });
  const draft = HDA.computeDraft({ board, picks: [], teams: 4, rounds: 2, mySlot: 1 });
  assert.equal(HDA.suggest({ board, draft }).suggestions[0].player.name, 'C1');
});
