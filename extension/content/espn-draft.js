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

  const app = await HDA.createApp({ host, mode: 'espn', sync: true, draftId, myTeamId });

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
      app.toggle();
    }
  }, true);

  HDA.startEspnSync({ app, leagueId: ctx.leagueId, seasonId, fetchJson, scanPage });
})();
