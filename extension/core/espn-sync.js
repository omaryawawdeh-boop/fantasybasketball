/*
 * ESPN live-draft sync loop, shared by the draft-room panel and the
 * standalone board ("follow my draft from any tab").
 *
 * Polls the league's draft detail every ~3s while a draft is running, loads
 * the player pool (names, ADP, injuries, projections) at start and every 5
 * minutes, and pushes everything into the app. Read-only: nothing is ever
 * written to ESPN.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  /**
   * @param {object} o
   * @param {object} o.app            from createApp()
   * @param {number} o.leagueId
   * @param {number} o.seasonId
   * @param {(url:string, headers?:object) => Promise<any>} o.fetchJson  throws with .status on HTTP errors
   * @param {() => boolean} [o.scanPage] fallback page reader; returns true if it found pick widgets
   */
  function startEspnSync({ app, leagueId, seasonId, fetchJson, scanPage }) {
    let failures = 0;
    let playersLoadedAt = 0;
    let timer = null;
    let stopped = false;
    const doc = typeof document !== 'undefined' ? document : null;

    async function loadPlayers(urls) {
      try {
        const players = HDA.parsePlayers(await fetchJson(urls.players, urls.playersHeaders), seasonId);
        if (players.length) return players;
      } catch (e) { /* fall through to the league-independent pool */ }
      return HDA.parsePlayers(await fetchJson(urls.playerPool, urls.playerPoolHeaders), seasonId);
    }

    function schedule(ms) {
      clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(tick, doc && doc.hidden ? Math.max(ms, 10000) : ms);
    }

    async function tick() {
      clearTimeout(timer);
      if (stopped) return;
      if (app.state.settings.syncMode === 'manual') { schedule(15000); return; }
      if (!leagueId) {
        const pageWorked = scanPage ? scanPage() : false;
        app.setEspn({ status: pageWorked ? 'dom' : 'error', message: 'No leagueId in the draft URL.' });
        schedule(4000);
        return;
      }
      const urls = HDA.draftUrls(seasonId, leagueId);
      try {
        const league = HDA.parseLeague(await fetchJson(urls.league));
        if (!league) throw new Error('Unexpected response from ESPN');
        const patch = { league, status: 'ok', lastOk: Date.now(), message: `${league.name || 'League'} (${leagueId}), season ${seasonId}` };
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
        // Fast while drafting, slow before it starts or after it ends.
        schedule(league.draft.inProgress ? 3000 : league.draft.complete ? 60000 : 10000);
      } catch (e) {
        failures++;
        const denied = e.status === 401 || e.status === 403;
        const why = denied
          ? 'ESPN refused the league read — make sure you’re logged in to ESPN in this browser.'
          : `ESPN request failed: ${e.message}.`;
        const pageWorked = scanPage ? scanPage() : false;
        app.setEspn({ status: pageWorked ? 'dom' : 'error', message: why + (scanPage ? ' Reading the page instead.' : ' Mark picks by hand meanwhile.') });
        schedule(Math.min(30000, 4000 * failures));
      }
    }

    app.onRetry = () => { failures = 0; tick(); };
    tick();
    return { tick, stop() { stopped = true; clearTimeout(timer); } };
  }

  /** Direct fetch from an extension page (host permissions, ESPN login cookies). */
  async function directFetchJson(url, headers) {
    const r = await fetch(url, { credentials: 'include', headers: headers || {} });
    if (!r.ok) throw Object.assign(new Error(`ESPN returned ${r.status}`), { status: r.status });
    return r.json();
  }

  Object.assign(HDA, { startEspnSync, directFetchJson });
})(typeof globalThis !== 'undefined' ? globalThis : this);
