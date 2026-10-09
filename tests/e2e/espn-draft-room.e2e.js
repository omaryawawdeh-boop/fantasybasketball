// End-to-end: loads the unpacked extension in Chromium, serves a FAKE ESPN draft
// room + FAKE ESPN API responses (synthetic ADP/stats, real player names so the
// name matching is exercised), and checks the panel follows the user's list.
// Run: node tests/e2e/espn-draft-room.e2e.js  (needs playwright + chromium)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
require('../load-core');
require('../../extension/data/default-rankings.js');
const HDA = globalThis.HDA;

const EXT = path.resolve(__dirname, '../../extension');
const OUT = process.env.E2E_OUT || path.resolve(__dirname, '../../e2e-output');
fs.mkdirSync(OUT, { recursive: true });

const SLOT_IDS = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
const players = HDA.DEFAULT_RANKINGS.slice(0, 120).map((p, i) => ({
  id: 1000 + i,
  player: {
    id: 1000 + i,
    fullName: p.name,
    proTeamId: 7,
    defaultPositionId: 1,
    eligibleSlots: [...(p.pos || []).map((x) => SLOT_IDS[x]).filter((x) => x != null), 11, 12],
    injuryStatus: p.name === 'Walker Kessler' ? 'OUT' : 'ACTIVE',
    // Synthetic ADP: market disagrees with the user in places (DR guys go later).
    ownership: { averageDraftPosition: p.dontReach ? p.rank + 25 : p.rank + ((i * 7) % 5) - 2 },
    draftRanksByRankType: { STANDARD: { rank: i + 1 } },
    stats: [{ seasonId: 2027, statSourceId: 1, statSplitTypeId: 0, averageStats: { 13: 8, 15: 4, 17: 2, 6: 7, 3: 5, 2: 1, 1: 1, 11: 2, 37: 0.3 } }],
  },
}));
const idOf = (name) => players.find((p) => p.player.fullName === name).id;

let picks = [];
const leagueJson = () => ({
  id: 4242,
  settings: {
    name: 'E2E League', size: 14,
    draftSettings: { type: 'SNAKE', date: Date.UTC(2026, 9, 18, 0, 0), pickOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
    rosterSettings: { lineupSlotCounts: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1 } },
    scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: HDA.weightsToItems(HDA.DEFAULT_LEAGUE.scoringWeights) },
  },
  teams: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, abbrev: `T${i + 1}`, name: `Team ${i + 1}` })),
  draftDetail: { inProgress: true, drafted: false, picks },
});
const pick = (overall, teamId, name) => picks.push({ overallPickNumber: overall, roundId: Math.ceil(overall / 14), teamId, playerId: idOf(name) });

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hda-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium', // full Chromium (new headless) — the headless shell can't load extensions
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1400, height: 900 },
  });
  await ctx.route('https://lm-api-reads.fantasy.espn.com/**', (route) => {
    const url = route.request().url();
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': 'https://fantasy.espn.com', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'x-fantasy-filter' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.includes('kona_player_info')) return route.fulfill({ status: 200, headers, body: JSON.stringify({ players }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify(leagueJson()) });
  });
  await ctx.route('https://fantasy.espn.com/basketball/draft**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body style="background:#fff;font-family:sans-serif"><h1 style="padding:20px">FAKE ESPN draft room (test fixture)</h1><div style="padding:20px;width:900px;height:600px;background:#eee">ESPN draft UI would be here</div></body></html>',
  }));

  const results = [];
  const check = (name, cond, extra) => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

  pick(1, 1, 'Nikola Jokic'); pick(2, 2, 'Shai Gilgeous-Alexander'); pick(3, 3, 'Victor Wembanyama'); pick(4, 4, 'Luka Doncic');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto('https://fantasy.espn.com/basketball/draft?leagueId=4242&seasonId=2027&teamId=5');
  const panel = page.locator('#hoops-draft-assistant');
  await panel.locator('.sync.ok').waitFor({ timeout: 15000 });
  const sync = await panel.locator('.sync').innerText();
  check('syncs with (mock) ESPN API', /Synced with ESPN/.test(sync), sync);
  const clock = await panel.locator('.clock').innerText();
  check('detects I am on the clock at pick 5', /ON THE CLOCK/.test(clock) && /Pick 5/.test(clock), clock);
  const top = await panel.locator('.top-name').innerText();
  check('top suggestion = highest available on MY list (Giannis)', /Giannis Antetokounmpo/.test(top), top);
  await page.screenshot({ path: path.join(OUT, '1-on-the-clock.png') });

  // I take Giannis; then picks run to my next turn (24). Others take my 4..8.
  pick(5, 5, 'Giannis Antetokounmpo');
  const others = ['Cade Cunningham', 'Jalen Johnson', 'Jayson Tatum', 'Anthony Edwards', 'Tyrese Maxey', 'Karl-Anthony Towns', 'Scottie Barnes', 'Donovan Mitchell',
    'Trae Young', 'Tyrese Haliburton', 'Amen Thompson', 'Alperen Sengün', 'Stephen Curry', 'Jalen Brunson', 'Jamal Murray', 'Evan Mobley', 'James Harden', 'Kevin Durant'];
  others.forEach((n, i) => pick(6 + i, ((6 + i - 1) % 14) + 1, n));
  await page.waitForFunction(() => /Pick 24/.test(document.querySelector('#hoops-draft-assistant').shadowRoot.querySelector('.clock').innerText), null, { timeout: 15000 });
  const top2 = await panel.locator('.top-name').innerText();
  // Next available on the list after those picks: #15 Josh Giddey (DR).
  check('after 23 picks, top = next on my list (Josh Giddey, DR)', /Josh Giddey/.test(top2), top2);
  check('DR badge shown', /DR/.test(top2));
  const notes = await panel.locator('.top .notes').innerText();
  check('DR acknowledged as a note, no nudge box', /you like him here/.test(notes) && (await panel.locator('.drhint').count()) === 0, notes.split('\n').find((l) => /DR/.test(l)));
  await page.screenshot({ path: path.join(OUT, '2-dr-note.png') });

  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  const t1 = await panel.locator('.th').first().innerText();
  check('fully drafted tiers show 0 left and fold away', /0\/2 left/.test(t1) && (await panel.locator('.tier').first().locator('.prow').count()) === 0, t1.replace(/\n/g, ' '));
  const goneCount = await panel.locator('.prow.gone').count();
  check('live tiers cross off drafted players', goneCount >= 3, `${goneCount} crossed off in open tiers`);
  await page.screenshot({ path: path.join(OUT, '3-tiers.png') });
  await panel.locator('[data-search]').fill('giannis');
  const mineRow = await panel.locator('.prow.mine .nm').first().innerText();
  check('my pick highlighted in tiers', /Giannis/.test(mineRow), mineRow);
  await panel.locator('[data-search]').fill('');

  await panel.locator('nav button', { hasText: 'My Team' }).click();
  const team = await panel.locator('.body').innerText();
  check('My Team lists Giannis with FP/G from league scoring', /Giannis/.test(team) && /FP\/G/.test(team));
  await page.screenshot({ path: path.join(OUT, '4-my-team.png') });

  // Manual search + Enter marks first match drafted (ESPN lag case).
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-search]').fill('giddey');
  await panel.locator('[data-search]').press('Enter');
  await page.waitForTimeout(300);
  await panel.locator('[data-search]').fill('');
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  const top3 = await panel.locator('.top-name').innerText();
  check('manual mark via search+Enter removes Giddey from suggestions', /Tyrese Haliburton|Amen|Alperen|Cooper Flagg/.test(top3) && !/Giddey/.test(top3), top3);

  // Collapse/expand hotkey.
  await page.keyboard.press('Alt+Shift+D');
  check('Alt+Shift+D minimizes panel', (await panel.locator('.tab-handle').count()) === 1);
  await page.keyboard.press('Alt+Shift+D');

  // Standalone board page.
  const [sw] = ctx.serviceWorkers().length ? ctx.serviceWorkers() : [await ctx.waitForEvent('serviceworker')];
  const extId = sw.url().split('/')[2];
  const board = await ctx.newPage();
  board.on('pageerror', (e) => console.log('BOARD ERROR', e.message));
  await board.goto(`chrome-extension://${extId}/standalone/board.html?manual=1`);
  await board.locator('#app .top-name').waitFor();
  check('standalone board suggests Jokic first', /Nikola Jokic/.test(await board.locator('#app .top-name').innerText()));
  await board.locator('#app .act').click();
  check('marking a pick advances to Victor Wembanyama', /Victor Wembanyama/.test(await board.locator('#app .top-name').innerText()));
  await board.screenshot({ path: path.join(OUT, '5-standalone.png'), fullPage: false });

  const opts = await ctx.newPage();
  opts.on('pageerror', (e) => console.log('OPTIONS ERROR', e.message));
  await opts.goto(`chrome-extension://${extId}/options/options.html`);
  await opts.locator('#current').waitFor();
  check('options shows 168-player board', /168/.test(await opts.locator('#current').innerText()));
  await opts.locator('#importBox summary').click();
  await opts.locator('#paste').fill('Nikola Jokic\t\nVictor Wembanyama*\t\nJosh Giddey\tDR');
  await opts.locator('#preview').click();
  check('options preview parses pasted Excel cells', /3 players parsed/.test(await opts.locator('#previewOut').innerText()));
  await opts.locator('#leagueId').fill('4242');
  await opts.locator('#seasonId').fill('2027');
  await opts.locator('#testLeague').click();
  await opts.locator('#leagueOut .ok').first().waitFor({ timeout: 10000 });
  check('options: Test connection reads the league', /Connected: E2E League/.test(await opts.locator('#leagueOut').innerText()));
  await opts.locator('#myTeam').selectOption('5');
  await opts.getByText('You pick 5th').waitFor({ timeout: 10000 });
  check('options: picking my team shows my slot + pick numbers', /5, 24, 33, 52/.test(await opts.locator('#leagueOut').innerText()));
  await opts.screenshot({ path: path.join(OUT, '6-options.png'), fullPage: true });

  // Follow the same league from a plain tab (e.g. drafting on the phone app).
  const follow = await ctx.newPage();
  follow.on('pageerror', (e) => console.log('FOLLOW ERROR', e.message));
  await follow.goto(`chrome-extension://${extId}/standalone/board.html?league=4242&season=2027`);
  await follow.locator('#app .sync.ok').waitFor({ timeout: 15000 });
  const ftop = await follow.locator('#app .top-name').innerText();
  check('follow board syncs league and shares marks with draft room', /Cooper Flagg/.test(ftop), ftop);
  check('follow board knows I am on the clock', /ON THE CLOCK/.test(await follow.locator('#app .clock').innerText()));
  await follow.screenshot({ path: path.join(OUT, '7-follow-board.png') });

  await ctx.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
