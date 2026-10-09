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
(async function () {
  if (window.__hdaLoaded) return;
  window.__hdaLoaded = true;
  const HDA = globalThis.HDA;

  const ctx = HDA.parseDraftUrl(location.href);
  const seasonId = ctx.seasonId || HDA.defaultSeasonId();
  const draftId = ctx.leagueId ? `espn-${seasonId}-${ctx.leagueId}` : 'espn-unknown';
  const settings = await HDA.storage.get('hda:settings', {});
  // The draft URL carries your teamId; fall back to the team you picked in Options.
  const myTeamId = ctx.teamId != null ? ctx.teamId : ((settings.myTeamIds || {})[ctx.leagueId] ?? null);

  const host = document.createElement('div');
  host.id = 'hoops-draft-assistant';
  document.documentElement.appendChild(host);

  async function fetchJson(url, headers) {
    // Same-site request from the page context carries the ESPN login cookies.
    try {
      const r = await fetch(url, { credentials: 'include', headers: headers || {} });
      if (r.ok) return await r.json();
      throw Object.assign(new Error(`ESPN returned ${r.status}`), { status: r.status });
    } catch (e) {
      // Fall back to the extension service worker (not subject to page CORS).
      const res = await chrome.runtime.sendMessage({ type: 'hda-fetch', url, headers });
      if (res && res.ok) return res.json;
      throw Object.assign(new Error((res && res.error) || e.message), { status: (res && res.status) || e.status });
    }
  }

  // Live feed: copies of the draft room's own incoming messages (content/ws-tap.js).
  // Listening starts before the panel loads so the opening burst isn't missed.
  const frames = [];
  const pending = [];
  let livePickCount = 0;
  let liveReady = false;
  let app;
  function handleFrame(text) {
    if (app.state.settings.syncMode === 'manual') return;
    const known = new Set(app.state.espn.players.map((p) => p.espnId));
    const picks = HDA.parseLiveFrame(text, known.size ? known : null);
    if (picks.length) { livePickCount += picks.length; app.addLivePicks(picks); }
  }
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__hda !== 'ws' || typeof d.data !== 'string') return;
    frames.push({ t: Date.now(), url: d.url, data: d.data.slice(0, 400) });
    if (frames.length > 40) frames.shift();
    if (liveReady) handleFrame(d.data);
    else if (pending.length < 500) pending.push(d.data);
  });

  app = await HDA.createApp({ host, mode: 'espn', sync: true, draftId, myTeamId });

  /** Read drafted names off ESPN's pick bar / pick history / rosters. */
  function scanPage() {
    const c = app.compute();
    const found = HDA.scanDraftedNames(document, c.board.players.slice(0, 600)).filter((k) => !c.draft.drafted.has(k));
    if (found.length) app.addDetected(found);
    return HDA.lastScanSawContainers;
  }
  // Page reading runs all the time (not only when ESPN's data fails): ESPN's
  // league data may not list picks until the draft is over.
  setInterval(() => { if (app.state.settings.syncMode !== 'manual' && !document.hidden) scanPage(); }, 1500);

  // Live feed (registered above): handle frames buffered while the panel loaded.
  liveReady = true;
  for (const f of pending.splice(0)) handleFrame(f);

  app.reportExtra = () => ({
    liveFeed: { framesSeen: frames.length, picksParsed: livePickCount, lastFrames: frames.slice(-25) },
    pageScan: HDA.lastScanInfo,
  });

  // Alt+Shift+D toggles the panel.
  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd' || ev.code === 'KeyD')) {
      ev.preventDefault();
      app.toggle();
    }
  }, true);

  HDA.startEspnSync({ app, leagueId: ctx.leagueId, seasonId, fetchJson, scanPage });
})();
