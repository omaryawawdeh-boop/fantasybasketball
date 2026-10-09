// Full-page board. Two modes:
//   board.html?league=888634487  -> follows that ESPN league's live draft (any tab,
//                                   e.g. while you draft in the ESPN phone app)
//   board.html?manual=1          -> manual tracking for any draft (Yahoo, mocks, in person)
// With no params it follows the league saved in Options, if any.
(async function () {
  const params = new URLSearchParams(location.search);
  const settings = { ...HDA.defaultSettings(), ...(await HDA.storage.get('hda:settings', {})) };
  const leagueId = params.get('manual') ? null : Number(params.get('league')) || settings.leagueId || null;
  const seasonId = Number(params.get('season')) || HDA.defaultSeasonId();
  const bar = document.getElementById('modebar');
  const host = document.getElementById('app');

  if (!leagueId) {
    bar.innerHTML = '<span><b>Manual board</b> — mark each pick with ✓ or type a name + Enter.</span>'
      + (settings.leagueId ? `<span><a href="?league=${settings.leagueId}">Follow ESPN league ${settings.leagueId}</a></span>` : '');
    HDA.createApp({ host, mode: 'standalone', draftId: 'standalone' });
    return;
  }
  bar.innerHTML = `<span>Following <b>ESPN league ${leagueId}</b> live (read-only, uses your ESPN login).</span><span><a href="?manual=1">Switch to manual board</a></span>`;
  const myTeamId = (settings.myTeamIds || {})[leagueId] ?? null;
  // Same draftId as the in-draft-room panel, so your marks are shared between them.
  const app = await HDA.createApp({ host, mode: 'standalone', sync: true, draftId: `espn-${seasonId}-${leagueId}`, myTeamId });
  HDA.startEspnSync({ app, leagueId, seasonId, fetchJson: HDA.directFetchJson });
})();
