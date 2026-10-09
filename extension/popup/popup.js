(async function () {
  const settings = (await chrome.storage.local.get('hda:settings'))['hda:settings'] || {};
  const leagueId = settings.leagueId || (globalThis.HDA && HDA.DEFAULT_LEAGUE && HDA.DEFAULT_LEAGUE.espnLeagueId);
  const open = (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  const follow = document.getElementById('follow');
  if (leagueId) {
    follow.textContent = `Follow my ESPN draft (league ${leagueId})`;
    follow.onclick = () => open(`standalone/board.html?league=${leagueId}`);
  } else follow.remove();
  document.getElementById('board').onclick = () => open('standalone/board.html?manual=1');
  document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();
})();
