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
  /**
   * Player ages from ESPN's public athlete records, cached for 30 days.
   * Stops early if ESPN doesn't answer, so a blocked endpoint costs nothing.
   */
  async function loadAges(ids, fetchPublic) {
    const cache = (await HDA.storage.get('hda:ages', {})) || {};
    const now = Date.now();
    const todo = [...new Set(ids)].filter((id) => id > 0 && (!cache[id] || now - cache[id].at > 30 * 864e5));
    let i = 0;
    let ok = 0;
    let fail = 0;
    const worker = async () => {
      while (i < todo.length) {
        if (fail >= 6 && ok === 0) return; // endpoint unreachable: give up quietly
        const id = todo[i++];
        try {
          const a = HDA.parseAthlete(await fetchPublic(HDA.athleteUrl(id)));
          if (a.dob || a.age != null) { cache[id] = { dob: a.dob, age: a.age, at: now }; ok++; } else fail++;
        } catch (e) { fail++; }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (ok) await HDA.storage.set('hda:ages', cache);
    return { ages: cache, fetched: ok, failed: fail };
  }

  function startEspnSync({ app, leagueId, seasonId, fetchJson, scanPage, fetchPublic }) {
    let agesRequested = false;
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
        if (!agesRequested && app.state.espn.players.length) {
          agesRequested = true;
          const b = app.compute().board;
          const ids = [
            ...b.players.filter((p) => p.onList && p.espnId != null).map((p) => p.espnId),
            ...app.state.espn.players.slice().sort((x, y) => (x.espnRank || 999) - (y.espnRank || 999)).slice(0, 250).map((p) => p.espnId),
          ];
          loadAges(ids, fetchPublic || fetchJson).then((r) => app.setAges(r.ages, r)).catch(() => {});
        }
        // Every 3s until the draft is over (ESPN's in-progress flag can lag).
        schedule(league.draft.complete ? 60000 : 3000);
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

  /**
   * One-off load of ESPN player data (ADP, projections, last season, ages) and
   * your league's scoring, for when no draft is running (the edit page).
   * Doesn't sync picks. Returns a short status string.
   */
  async function loadPlayerData({ app, leagueId, seasonId, fetchJson, fetchPublic }) {
    const urls = HDA.draftUrls(seasonId, leagueId);
    let league = null;
    try { league = HDA.parseLeague(await fetchJson(urls.league)); } catch (e) { /* players may still load */ }
    let players = [];
    try { players = HDA.parsePlayers(await fetchJson(urls.players, urls.playersHeaders), seasonId); } catch (e) { /* try the open pool */ }
    if (!players.length) {
      try { players = HDA.parsePlayers(await fetchJson(urls.playerPool, urls.playerPoolHeaders), seasonId); } catch (e) { /* offline */ }
    }
    if (!players.length) return 'ESPN player data unavailable (log in at fantasy.espn.com); showing your tier sheet numbers.';
    app.setEspn({ league, players, lastOk: Date.now(), message: 'ESPN player data (no live draft)' });
    const ids = players.slice().sort((x, y) => (x.espnRank || 999) - (y.espnRank || 999)).slice(0, 300).map((p) => p.espnId);
    loadAges(ids, fetchPublic || fetchJson).then((r) => app.setAges(r.ages, r)).catch(() => {});
    return `Loaded ESPN data for ${players.length} players${league && league.scoringItems.length ? ' and your league scoring' : ''}.`;
  }

  /** Direct fetch from an extension page (host permissions, ESPN login cookies). */
  async function directFetchJson(url, headers) {
    const r = await fetch(url, { credentials: 'include', headers: headers || {} });
    if (!r.ok) throw Object.assign(new Error(`ESPN returned ${r.status}`), { status: r.status });
    return r.json();
  }

  Object.assign(HDA, { startEspnSync, directFetchJson, loadAges, loadPlayerData });
})(typeof globalThis !== 'undefined' ? globalThis : this);
