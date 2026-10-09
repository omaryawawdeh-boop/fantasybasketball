/*
 * Runs inside ESPN's basketball draft room (fantasy.espn.com/basketball/draft?...).
 *
 * Sync strategy, in order:
 *  1. ESPN's own read API for this league (the same requests ESPN's draft room
 *     makes, sent with your existing ESPN login). Gives exact picks, teams, draft
 *     order, roster slots, scoring, ADP and projections.
 *  2. If that is unreadable (some mock-draft rooms, ESPN outages), read drafted
 *     player names off the page. Best effort: ESPN can change its markup.
 *  3. Manual: every player row has a ✓ button and the search box marks on Enter.
 * Nothing is ever written to ESPN.
 */
(function () {
  if (window.__hdaLoaded) return;
  window.__hdaLoaded = true;
  const HDA = globalThis.HDA;

  const ctx = HDA.parseDraftUrl(location.href);
  const seasonId = ctx.seasonId || HDA.defaultSeasonId();
  const draftId = ctx.leagueId ? `espn-${seasonId}-${ctx.leagueId}` : 'espn-unknown';

  const host = document.createElement('div');
  host.id = 'hoops-draft-assistant';
  document.documentElement.appendChild(host);

  let app;
  let failures = 0;
  let playersLoadedAt = 0;
  let timer = null;

  async function fetchJson(url, headers) {
    // Same-site request from the page context carries the ESPN login cookies.
    try {
      const r = await fetch(url, { credentials: 'include', headers: headers || {} });
      if (r.ok) return await r.json();
      if (r.status === 401 || r.status === 403 || r.status === 404) throw Object.assign(new Error(`ESPN returned ${r.status}`), { status: r.status });
      throw new Error(`ESPN returned ${r.status}`);
    } catch (e) {
      // Fall back to the extension service worker (not subject to page CORS).
      const res = await chrome.runtime.sendMessage({ type: 'hda-fetch', url, headers });
      if (res && res.ok) return res.json;
      const err = new Error((res && res.error) || e.message);
      err.status = (res && res.status) || e.status;
      throw err;
    }
  }

  async function loadPlayers(urls) {
    try {
      const json = await fetchJson(urls.players, urls.playersHeaders);
      const players = HDA.parsePlayers(json, seasonId);
      if (players.length) return players;
    } catch (e) { /* fall through to the league-independent pool */ }
    const json = await fetchJson(urls.playerPool, urls.playerPoolHeaders);
    return HDA.parsePlayers(json, seasonId);
  }

  async function tick() {
    clearTimeout(timer);
    if (!app) return;
    if (app.state.settings.syncMode === 'manual') { schedule(15000); return; }
    if (!ctx.leagueId) {
      app.setEspn({ status: 'error', message: 'No leagueId in the draft URL.' });
      scanPage();
      schedule(4000);
      return;
    }
    const urls = HDA.draftUrls(seasonId, ctx.leagueId);
    try {
      const league = HDA.parseLeague(await fetchJson(urls.league));
      if (!league) throw new Error('Unexpected response from ESPN');
      const patch = { league, status: 'ok', lastOk: Date.now(), message: `League ${ctx.leagueId}, season ${seasonId}` };
      // Player pool: once at start, then every 5 minutes (ADP/injuries move slowly).
      if (!playersLoadedAt || Date.now() - playersLoadedAt > 5 * 60 * 1000 || (league.draft.picks.length && !app.state.espn.players.length)) {
        try {
          patch.players = await loadPlayers(urls);
          playersLoadedAt = Date.now();
        } catch (e) {
          patch.message += ` · player list unavailable (${e.message})`;
        }
      }
      failures = 0;
      app.setEspn(patch);
      schedule(league.draft.complete ? 30000 : 3000);
    } catch (e) {
      failures++;
      const msg = e.status === 401 || e.status === 403
        ? 'ESPN refused the league read (not logged in, or this draft room isn’t readable). Reading the page instead.'
        : `ESPN request failed: ${e.message}. Reading the page instead.`;
      const pageWorked = scanPage();
      app.setEspn({ status: pageWorked ? 'dom' : 'error', message: msg });
      schedule(Math.min(30000, 4000 * failures));
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, document.hidden ? Math.max(ms, 10000) : ms);
  }

  /** Fallback: find drafted player names in ESPN's pick-history / roster widgets. */
  function scanPage() {
    const c = app.compute();
    const names = c.board.players.filter((p) => !c.draft.drafted.has(p.key)).slice(0, 450);
    const found = HDA.scanDraftedNames(document, names);
    if (found.length) app.addDetected(found);
    return HDA.lastScanSawContainers;
  }

  // Alt+Shift+D toggles the panel.
  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd' || ev.code === 'KeyD')) {
      ev.preventDefault();
      if (app) app.toggle();
    }
  }, true);

  HDA.createApp({ host, mode: 'espn', draftId, myTeamId: ctx.teamId }).then((a) => {
    app = a;
    app.onRetry = () => { failures = 0; tick(); };
    tick();
  });
})();
