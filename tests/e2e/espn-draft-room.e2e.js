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
players.push({ id: 9999, player: { id: 9999, fullName: 'Zed Offlist', proTeamId: 7, defaultPositionId: 5, eligibleSlots: [4, 11, 12], injuryStatus: 'ACTIVE', ownership: { averageDraftPosition: 150 }, draftRanksByRankType: { STANDARD: { rank: 150 } } } });
const idOf = (name) => players.find((p) => p.player.fullName === name).id;

let picks = [];
const leagueJson = (noPicks) => ({
  id: 4242,
  settings: {
    name: 'E2E League', size: 14,
    draftSettings: { type: 'SNAKE', date: Date.UTC(2026, 9, 18, 0, 0), pickOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] },
    rosterSettings: { lineupSlotCounts: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 11: 3, 12: 3, 13: 1 } },
    scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: HDA.weightsToItems(HDA.DEFAULT_LEAGUE.scoringWeights) },
  },
  teams: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, abbrev: `T${i + 1}`, name: `Team ${i + 1}` })),
  draftDetail: { inProgress: true, drafted: false, picks: noPicks ? [] : picks },
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
    return route.fulfill({ status: 200, headers, body: JSON.stringify(leagueJson(url.includes('/leagues/5555'))) });
  });
  // Live draft connection for league 5555 (the real draft room gets picks this way).
  let liveSocket = null;
  await ctx.routeWebSocket(/fantasydraft\.espn\.com/, (ws) => { liveSocket = ws; });
  await ctx.route('https://fantasy.espn.com/basketball/draft?leagueId=5555**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: `<!doctype html><html><body style="font-family:sans-serif">
      <div class="draft-header"><div class="pick-message">Your autopick would be: Nikola Jokic</div></div>
      <div class="picks-carousel" id="car"></div>
      <div class="players-tab">
        <input placeholder="Player Name" id="q">
        <div class="board-players"><table id="tbl"></table></div>
      </div>
      <script>
        // Fake ESPN player list: first 8 shown, the rest only via the search box.
        const NAMES = ${JSON.stringify(HDA.DEFAULT_RANKINGS.slice(0, 40).map((p) => p.name))};
        window.__clicks = [];
        const draw = () => {
          const q = document.getElementById('q').value.toLowerCase();
          const rows = q ? NAMES.filter((n) => n.toLowerCase().includes(q)) : NAMES.slice(0, 8);
          document.getElementById('tbl').innerHTML = rows.map((n) => '<tr><td><span class="name">' + n + '</span></td><td><button>DRAFT</button></td><td><button>QUEUE</button></td></tr>').join('');
        };
        document.addEventListener('DOMContentLoaded', () => {
          draw();
          document.getElementById('q').addEventListener('input', draw);
          document.getElementById('tbl').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') window.__clicks.push(e.target.textContent + ':' + e.target.closest('tr').querySelector('.name').textContent);
          });
        });
        window.addPick = (t) => { const d = document.createElement('div'); d.className = 'pick__player'; d.textContent = t; document.getElementById('car').appendChild(d); };
        new WebSocket('wss://fantasydraft.espn.com/game/fba/5555');
      </script></body></html>`,
  }));
  await ctx.route('https://fantasy.espn.com/basketball/draft?leagueId=4242**', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body style="background:#fff;font-family:sans-serif"><h1 style="padding:20px">FAKE ESPN draft room (test fixture)</h1><div style="padding:20px;width:900px;height:600px;background:#eee">ESPN draft UI would be here</div></body></html>',
  }));

  const results = [];
  const results0 = results;
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
  // Expected: the first player on my (built-in) list who hasn't been picked.
  const pickedNames = new Set(['Nikola Jokic', 'Shai Gilgeous-Alexander', 'Victor Wembanyama', 'Luka Doncic', 'Giannis Antetokounmpo', ...others]);
  const remaining = HDA.DEFAULT_RANKINGS.filter((p) => !pickedNames.has(p.name));
  const expectedTop = remaining[0];
  check(`after 23 picks, top = next on my list (${expectedTop.name})`, top2.includes(expectedTop.name), top2);
  check('DR badge shown', /DR/.test(top2));
  const notes = await panel.locator('.top .notes').innerText();
  check('DR acknowledged as a note, no nudge box', /you like him here/.test(notes) && (await panel.locator('.drhint').count()) === 0, notes.split('\n').find((l) => /DR/.test(l)));
  await page.screenshot({ path: path.join(OUT, '2-dr-note.png') });

  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  const t1 = await panel.locator('.th').first().innerText();
  check('fully drafted tiers show 0 left and fold away', /0\/2 left/.test(t1) && (await panel.locator('.tier').first().locator('.prow').count()) === 0, t1.replace(/\n/g, ' '));
  const goneCount = await panel.locator('.prow.gone').count();
  check('live tiers cross off drafted players', goneCount >= 3, `${goneCount} crossed off in open tiers`);
  const oddsHead = await panel.locator('.oddshead').innerText();
  check('My Tiers shows odds header for my next 3 turns', /#33/.test(oddsHead) && /#52/.test(oddsHead) && /#61/.test(oddsHead), oddsHead.replace(/\n/g, ' '));
  const firstOdds = await panel.locator('.prow:not(.gone) .odds').first().innerText();
  check('each available player shows 3 availability %s', (firstOdds.match(/%/g) || []).length === 3, firstOdds.replace(/\n/g, ' '));
  await page.screenshot({ path: path.join(OUT, '3-tiers.png') });
  await panel.locator('[data-search]').fill('giannis');
  const mineRow = await panel.locator('.prow.mine .nm').first().innerText();
  check('my pick highlighted in tiers', /Giannis/.test(mineRow), mineRow);
  await panel.locator('[data-search]').fill('');

  await panel.locator('nav button', { hasText: 'My Team' }).click();
  const team = await panel.locator('.body').innerText();
  check('My Team lists Giannis with FP/G from league scoring', /Giannis/.test(team) && /FP\/G/.test(team));
  await page.screenshot({ path: path.join(OUT, '4-my-team.png') });
  await panel.locator('nav button', { hasText: 'Plan' }).click();
  await panel.locator('.plan .prow').first().waitFor({ timeout: 8000 });
  const planRows = await panel.locator('.plan .prow').count();
  check('Plan tab plans every remaining pick (12 after my first)', planRows === 12, `${planRows} rows`);
  check('Plan shows projected team balance', (await panel.locator('.teamstrip').count()) >= 1);
  await page.screenshot({ path: path.join(OUT, '10-plan.png') });

  // Manual search + Enter marks first match drafted (ESPN lag case).
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-search]').fill(expectedTop.name.split(' ').slice(-1)[0].toLowerCase());
  await panel.locator('[data-search]').press('Enter');
  await page.waitForTimeout(300);
  await panel.locator('[data-search]').fill('');
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  const top3 = await panel.locator('.top-name').innerText();
  check(`manual mark via search+Enter removes ${expectedTop.name}; next is ${remaining[1].name}`, top3.includes(remaining[1].name), top3);

  // ---- Editing my list mid-draft ----
  page.on('dialog', (d) => d.accept());
  const topName = async () => panel.locator('.top-name').first().evaluate((el) => el.firstChild.textContent.trim());
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  const topBefore = await topName();
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-act="editToggle"]').click();
  check('Edit list mode opens with edit bar', (await panel.locator('.editbar').count()) === 1);
  // Type a new rank: move Cooper Flagg to #1.
  const target = remaining[4].name; // still on the board, not my top
  await panel.locator('[data-search]').fill(target.split(' ').slice(-1)[0].toLowerCase());
  await panel.locator('.prow.edit .rkbtn').first().click();
  await panel.locator('[data-rankinput]').fill('1');
  await panel.locator('[data-rankinput]').press('Enter');
  await panel.locator('[data-search]').fill('');
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check(`typing rank 1 makes ${target} my top suggestion`, (await topName()) === target, await topName());
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-act="edUndo"]').click();
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check('Undo restores the previous order', (await topName()) === topBefore, await topName());
  // Drag and drop: drag Devin Booker onto the row of the current top available player.
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-act="hideDrafted"]').click(); // hide drafted rows: the live part of the list sits together
  const avail = panel.locator('.prow.edit:not(.gone)');
  const firstAvail = (await avail.first().locator('.nm').innerText()).trim();
  const secondAvail = (await avail.nth(2).locator('.nm').innerText()).trim();
  await avail.nth(2).dragTo(avail.first());
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check('drag-and-drop moves a player up the list', (await topName()) === secondAvail, `${firstAvail} -> ${await topName()} (dragged ${secondAvail})`);
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  await panel.locator('[data-act="hideDrafted"]').click();
  // Flags and tier buttons.
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  const brow = panel.locator('.prow.edit', { hasText: 'Devin Booker' });
  await brow.locator('[data-act="edFlag"]', { hasText: 'DR' }).click();
  check('DR toggle adds the flag', await panel.locator('.prow.edit', { hasText: 'Devin Booker' }).locator('.flagbtn.on.dr').count() === 1);
  const tierOf = (n) => panel.locator('.prow.edit', { hasText: n }).evaluate((el) => el.closest('.tier').querySelector('.tn').textContent);
  const tierBefore = await tierOf('Devin Booker');
  await panel.locator('.prow.edit', { hasText: 'Devin Booker' }).locator('[data-act="edTier"]', { hasText: 'T\u2193' }).click();
  const tierAfter = await tierOf('Devin Booker');
  check('T\u2193 moves him into the next tier', Number(tierAfter.slice(1)) === Number(tierBefore.slice(1)) + 1, `${tierBefore} -> ${tierAfter}`);
  // Add an off-list player as my next pick.
  await panel.locator('[data-search]').fill('offlist');
  await panel.locator('[data-act="edAdd"]', { hasText: '+ Next' }).click();
  await panel.locator('[data-search]').fill('');
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check('"+ Next" adds an off-list player as my next suggestion', (await topName()) === 'Zed Offlist', await topName());
  // Edits survive a reload.
  await page.reload();
  await panel.locator('.sync.ok').waitFor({ timeout: 15000 });
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check('edits persist after reloading the draft room', (await topName()) === 'Zed Offlist', await topName());
  // Restore the spreadsheet board.
  await panel.locator('nav button', { hasText: 'My Tiers' }).click();
  if (!(await panel.locator('.editbar').count())) await panel.locator('[data-act="editToggle"]').click();
  await panel.locator('[data-act="edReset"]').click();
  await panel.locator('[data-act="editToggle"]').click();
  await panel.locator('nav button', { hasText: 'Suggestions' }).click();
  check('Restore spreadsheet puts the original order back', (await topName()) === topBefore, await topName());

  // Collapse/expand hotkey.
  await page.keyboard.press('Alt+Shift+D');
  check('Alt+Shift+D minimizes panel', (await panel.locator('.tab-handle').count()) === 1);
  await page.keyboard.press('Alt+Shift+D');

  // ---- Real-ESPN behaviour: league data has no picks; picks arrive live + on the page ----
  const live = await ctx.newPage();
  live.on('pageerror', (e) => console.log('LIVE PAGE ERROR', e.message));
  await live.goto('https://fantasy.espn.com/basketball/draft?leagueId=5555&seasonId=2027&teamId=3');
  const lp = live.locator('#hoops-draft-assistant');
  await lp.locator('.sync.ok').waitFor({ timeout: 15000 });
  for (let i = 0; i < 50 && !liveSocket; i++) await live.waitForTimeout(100);
  check('draft room live connection observed', !!liveSocket);
  // Not on the clock (pick 1, I'm 3rd): the panel offers QUEUE, which clicks ESPN's QUEUE button.
  await lp.locator('.top [data-act="espn"]').first().click();
  await live.waitForTimeout(400);
  const qClicks = await live.evaluate(() => window.__clicks.slice());
  check('panel "Queue" clicks ESPN\'s QUEUE button for that player', qClicks.some((c) => /^QUEUE:/.test(c)), qClicks.join(', '));
  liveSocket.send(`SELECTED 1 ${idOf('Nikola Jokic')} {AAAA-BBBB}`);
  await live.waitForFunction(() => /Pick 2\b/.test(document.querySelector('#hoops-draft-assistant').shadowRoot.querySelector('.clock').innerText), null, { timeout: 5000 });
  check('live-feed pick crosses off Jokic within seconds', !/Nikola Jokic/.test(await lp.locator('.top-name').innerText()));
  await live.evaluate(() => window.addPick('V. Wembanyama'));
  await live.waitForFunction(() => /ON THE CLOCK/.test(document.querySelector('#hoops-draft-assistant').shadowRoot.querySelector('.clock').innerText), null, { timeout: 5000 });
  const ltop = await lp.locator('.top-name').innerText();
  // On the clock: "Draft" needs two taps, then clicks ESPN's DRAFT button (searching ESPN's list if needed).
  await lp.locator('nav button', { hasText: 'My Tiers' }).click();
  await lp.locator('[data-search]').fill('maxey');
  const dBtn = lp.locator('.prow [data-act="espn"]').first();
  check('on the clock the panel button reads "Draft"', /Draft/.test(await dBtn.innerText()));
  await dBtn.click();
  check('first tap only arms it ("Tap again to draft")', /Tap again/.test(await dBtn.innerText()) && !(await live.evaluate(() => window.__clicks.some((c) => c.startsWith('DRAFT')))));
  await dBtn.click();
  await live.waitForFunction(() => window.__clicks.some((c) => c.startsWith('DRAFT:')), null, { timeout: 6000 }).catch(() => {});
  const dClicks = await live.evaluate(() => window.__clicks.slice());
  check('second tap: ESPN search used, DRAFT clicked for Tyrese Maxey', dClicks.includes('DRAFT:Tyrese Maxey'), dClicks.join(', '));
  await live.waitForTimeout(600);
  const qv = await live.evaluate(() => document.getElementById('q').value);
  check('ESPN search box cleared afterwards', qv === '', JSON.stringify(qv));
  await lp.locator('[data-search]').fill('');
  await lp.locator('nav button', { hasText: 'Suggestions' }).click();
  const liveTop = HDA.DEFAULT_RANKINGS.find((p) => !['Nikola Jokic', 'Victor Wembanyama'].includes(p.name)).name;
  check(`page-read pick ("V. Wembanyama") crosses him off; on the clock at pick 3 (top: ${liveTop})`, ltop.includes(liveTop), ltop);
  check('available-list rows (DRAFT buttons) and autopick banner are NOT crossed off', /Giannis Antetokounmpo/.test(await lp.locator('.body').innerText()));
  // Last-name-only pick cell ("Doncic" -> Luka) also counts; DRAFT-button rows still don't.
  await live.evaluate(() => window.addPick('Doncic PG'));
  await live.waitForFunction(() => !/Luka Doncic/.test(document.querySelector('#hoops-draft-assistant').shadowRoot.querySelector('.body').innerText), null, { timeout: 5000 }).catch(() => {});
  check('last-name-only pick cell crosses off Luka', !/Luka Doncic/.test(await lp.locator('.body').innerText()));
  liveSocket.send(`SELECTED 3 ${idOf('Shai Gilgeous-Alexander')} {MINE}`);
  await lp.locator('nav button', { hasText: 'My Team' }).click();
  await live.waitForTimeout(500);
  check('my live pick lands on My Team', /Shai Gilgeous-Alexander/.test(await lp.locator('.body').innerText()));
  await lp.locator('nav button', { hasText: 'My Tiers' }).click();
  const lt1 = await lp.locator('.th').first().innerText();
  check('My Tiers: Tier 1 (Jokic, Wemby) fully crossed off', /0\/2 left/.test(lt1), lt1.replace(/\n/g, ' '));
  await lp.locator('[data-search]').fill('shai');
  check('My Tiers: my live pick shows as mine', (await lp.locator('.prow.mine .nm').count()) === 1);
  await lp.locator('[data-search]').fill('');
  const oddsBefore = (await lp.locator('.odds').allInnerTexts()).join('|');
  liveSocket.send('SELECTED 5 1010 {ODDS}'); // a player still on the board
  await live.waitForTimeout(800);
  const oddsAfter = (await lp.locator('.odds').allInnerTexts()).join('|');
  check('availability odds recalculate after a pick', oddsBefore.length > 0 && oddsBefore !== oddsAfter);
  // Scrolling must survive background syncs and new picks.
  await lp.locator('.body').evaluate((el) => { el.scrollTop = 900; });
  const before = await lp.locator('.body').evaluate((el) => el.scrollTop);
  liveSocket.send(`SELECTED 4 ${idOf('Cade Cunningham')} {X}`);
  await live.waitForTimeout(4500);
  const after = await lp.locator('.body').evaluate((el) => el.scrollTop);
  check('scroll position stays put through syncs and new picks', before > 500 && Math.abs(after - before) < 5, `${before} -> ${after}`);
  await live.screenshot({ path: path.join(OUT, '8-live-sync.png') });
  await lp.locator('nav button', { hasText: 'Picks' }).click();
  await lp.locator('[data-act="copyReport"]').click();
  await live.waitForTimeout(300);
  check('Copy sync report button works', /Copied/.test(await lp.locator('[data-act="copyReport"]').innerText()));

  // Standalone board page.
  const [sw] = ctx.serviceWorkers().length ? ctx.serviceWorkers() : [await ctx.waitForEvent('serviceworker')];
  const extId = sw.url().split('/')[2];
  const board = await ctx.newPage();
  board.on('pageerror', (e) => console.log('BOARD ERROR', e.message));
  await board.goto(`chrome-extension://${extId}/standalone/board.html?manual=1`);
  await board.locator('#app nav button', { hasText: 'Suggestions' }).click(); // the last-used tab is remembered
  await board.locator('#app .top-name').waitFor();
  check('standalone board suggests Jokic first', /Nikola Jokic/.test(await board.locator('#app .top-name').innerText()));
  await board.locator('#app .act').click();
  check(`marking a pick advances to ${HDA.DEFAULT_RANKINGS[1].name}`, (await board.locator('#app .top-name').innerText()).includes(HDA.DEFAULT_RANKINGS[1].name));
  await board.screenshot({ path: path.join(OUT, '5-standalone.png'), fullPage: false });

  // Team fit on the manual board: give me 6 forwards and 2 vets, then check the warnings.
  const mineVia = async (name) => {
    await board.locator('#app nav button', { hasText: 'My Tiers' }).click();
    await board.locator('#app [data-search]').fill(name);
    await board.locator('#app .prow').first().locator('[data-act="toggleMine"]').click();
    await board.locator('#app [data-search]').fill('');
  };
  for (const n of ['Jalen Johnson', 'Jayson Tatum', 'Paolo Banchero', 'Franz Wagner', 'Julius Randle', 'Lauri Markkanen', 'Stephen Curry', 'James Harden']) await mineVia(n);
  await board.locator('#app nav button', { hasText: 'Suggestions' }).click();
  const strip = await board.locator('#app .teamstrip').first().innerText();
  check('team strip shows forwards over target and 2 vets', /F\s*6\/5/.test(strip.replace(/\n/g, ' ')) && /35\+\s*2\/2/.test(strip.replace(/\n/g, ' ')), strip.replace(/\n/g, ' '));
  await board.locator('#app nav button', { hasText: 'My Tiers' }).click();
  await board.locator('#app [data-search]').fill('lebron');
  const lebron = await board.locator('#app .prow').first().innerText();
  check('a third 35+ player (LeBron, 41) is flagged', /Age 41: 2 vets/.test(lebron), lebron.replace(/\n/g, ' '));
  await board.locator('#app [data-search]').fill('kawhi');
  check('another forward is flagged "Too many F"', /Too many F/.test(await board.locator('#app .prow').first().innerText()));
  await board.locator('#app [data-search]').fill('');
  // Make a forward my #1 available by marking everyone above him drafted, then expect "Draft instead".
  await board.locator('#app nav button', { hasText: 'Suggestions' }).click();
  for (let i = 0; i < 25; i++) {
    const topTxt = await board.locator('#app .top-name').first().innerText();
    if (await board.locator('#app .top.warned').count()) break;
    await board.locator('#app .top .act').first().click();
    if (!topTxt) break;
  }
  check('when my #1 hurts the team: red "Avoid" box + "Draft instead" card', (await board.locator('#app .avoid').count()) === 1 && (await board.locator('#app .top.instead').count()) === 1,
    (await board.locator('#app .top-name').allInnerTexts()).join(' -> '));
  await board.screenshot({ path: path.join(OUT, '9-team-fit.png') });

  const opts = await ctx.newPage();
  opts.on('pageerror', (e) => console.log('OPTIONS ERROR', e.message));
  await opts.goto(`chrome-extension://${extId}/options/options.html`);
  await opts.locator('#current').waitFor();
  check('options shows 180-player board (my edits + Mara, Stirtz)', /180/.test(await opts.locator('#current').innerText()));
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
  await follow.locator('#app nav button', { hasText: 'Suggestions' }).click();
  const ftop = await follow.locator('#app .top-name').innerText();
  check('follow board syncs league and shares marks with draft room', ftop.includes(remaining[1].name), ftop);
  check('follow board knows I am on the clock', /ON THE CLOCK/.test(await follow.locator('#app .clock').innerText()));
  await follow.screenshot({ path: path.join(OUT, '7-follow-board.png') });

  // Edit page with no draft running: ESPN data (league 4242 saved in Options) + tier sheet numbers.
  const ed = await ctx.newPage();
  ed.on('pageerror', (e) => console.log('EDIT ERROR', e.message));
  await ed.goto(`chrome-extension://${extId}/standalone/board.html?manual=1&edit=1`);
  const ea = ed.locator('#app');
  await ea.locator('.prow.edit').first().waitFor();
  await ed.waitForFunction(() => /ADP <b>\d/.test(document.querySelector('#app').shadowRoot.querySelector('.prow.edit .edstats').innerHTML), null, { timeout: 15000 }).catch(() => {});
  const sheetCade = HDA.TIER_SHEET_STATS.byName.get('cade cunningham');
  await ea.locator('[data-search]').fill('cunningham');
  const cade = await ea.locator('.prow.edit', { hasText: 'Cade Cunningham' }).locator('.edstats').innerText();
  check(`edit view shows ADP, last season FP/G (tier sheet: ${sheetCade.fp}, ${sheetCade.gp} GP) and projected FP/G`,
    /ADP \d/.test(cade) && cade.includes(`Last ${sheetCade.fp}`) && cade.includes(`${sheetCade.gp} GP`) && /Proj \d/.test(cade), cade.replace(/\n/g, ' '));
  await ea.locator('[data-search]').fill('jokic');
  const jok = await ea.locator('.prow.edit', { hasText: 'Nikola Jokic' }).locator('.edstats').innerText();
  await ea.locator('[data-search]').fill('');
  check('no ESPN ADP -> falls back to market rank from the tier sheet', /Mkt #2/.test(jok), jok.replace(/\n/g, ' '));
  check('Aday Mara and Bennett Stirtz are on the list', (await ea.locator('.prow.edit', { hasText: 'Aday Mara' }).count()) === 1 && (await ea.locator('.prow.edit', { hasText: 'Bennett Stirtz' }).count()) === 1);
  await ea.locator('[data-addname]').fill('offlist');
  await ea.locator('.addhits .chip').first().waitFor({ timeout: 5000 });
  await ea.locator('[data-addrank]').fill('3');
  await ea.locator('.addhits .chip').first().click();
  const third = await ea.locator('.prow.edit').nth(2).locator('.nm').innerText();
  check('Add player box: ESPN match added at the typed rank (#3)', /Zed Offlist/.test(third), third);
  await ea.locator('[data-addname]').fill('Totally Newguy');
  await ea.locator('[data-addname]').press('Enter');
  check('Add player box: a name ESPN doesn\'t know is added as typed (at the bottom)', /Totally Newguy/.test(await ea.locator('.prow.edit').last().locator('.nm').innerText()));
  await ed.screenshot({ path: path.join(OUT, '12-edit-stats.png') });
  ed.on('dialog', (d) => d.accept());
  await ea.locator('[data-act="edReset"]').click();

  await ctx.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
