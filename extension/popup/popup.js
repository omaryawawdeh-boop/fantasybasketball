(async function () {
  const settings = (await chrome.storage.local.get('hda:settings'))['hda:settings'] || {};
  const leagueId = settings.leagueId || (globalThis.HDA && HDA.DEFAULT_LEAGUE && HDA.DEFAULT_LEAGUE.espnLeagueId);
  const open = (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  const follow = document.getElementById('follow');
  if (leagueId) {
    follow.textContent = `Follow my ESPN draft (league ${leagueId})`;
    follow.onclick = () => open(`standalone/board.html?league=${leagueId}`);
  } else follow.remove();
  document.getElementById('edit').onclick = () => open('standalone/board.html?manual=1&edit=1');
  document.getElementById('board').onclick = () => open('standalone/board.html?manual=1');
  document.getElementById('phone').onclick = () => chrome.runtime.sendMessage({ type: 'hda-phone-sync', mode: 'open' });
  const last = (await chrome.storage.local.get('hda:phoneSync'))['hda:phoneSync'];
  if (last && last.at) {
    const min = Math.round((Date.now() - last.at) / 60000);
    document.getElementById('phonesync').textContent = `Last phone sync: ${min < 1 ? 'just now' : min < 60 ? min + ' min ago' : Math.round(min / 60) + ' h ago'} (${last.direction}).`;
  }
  document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();
})();
