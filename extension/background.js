// Service worker: proxies ESPN read requests (fallback when page CORS blocks the
// content script), opens extension pages, keeps the phone list in sync and keeps
// a backup copy of your rankings in Chrome sync storage.
importScripts('data/default-rankings.js');
const HDA = globalThis.HDA;
const ALLOWED_HOSTS = new Set(['lm-api-reads.fantasy.espn.com', 'fantasy.espn.com', 'sports.core.api.espn.com']);
const AUTO_SYNC_EVERY_MS = 15 * 60 * 1000;
const SYNC_TAB_TIMEOUT_MS = 45 * 1000;

async function getLocal(k) { return (await chrome.storage.local.get(k))[k]; }

async function phoneListUrl() {
  const s = (await getLocal('hda:settings')) || {};
  return s.phoneListUrl || (HDA.DEFAULT_LEAGUE && HDA.DEFAULT_LEAGUE.phoneListUrl) || '';
}

// ---- Phone list sync: open the phone page; the bridge content script does the work.
let syncTabId = null;
let syncTabTimer = null;
function closeSyncTab() {
  if (syncTabTimer) { clearTimeout(syncTabTimer); syncTabTimer = null; }
  if (syncTabId != null) { chrome.tabs.remove(syncTabId).catch(() => {}); syncTabId = null; }
}

async function phoneSync(mode) {
  const url = await phoneListUrl();
  if (!url) return { ok: false, error: 'No phone list link set (Options page).' };
  if (mode === 'open') {
    await chrome.tabs.create({ url, active: true });
    return { ok: true };
  }
  const s = (await getLocal('hda:settings')) || {};
  if (s.autoPhoneSync === false) return { ok: false, skipped: 'auto sync off' };
  const last = (await getLocal('hda:phoneSync')) || {};
  if (last.at && Date.now() - last.at < AUTO_SYNC_EVERY_MS) return { ok: false, skipped: 'synced recently' };
  if (syncTabId != null) return { ok: false, skipped: 'already syncing' };
  const tab = await chrome.tabs.create({ url, active: false });
  syncTabId = tab.id;
  syncTabTimer = setTimeout(closeSyncTab, SYNC_TAB_TIMEOUT_MS);
  return { ok: true, tabId: tab.id };
}

// ---- Chrome sync backup of hda:rankings (survives reinstalling the extension).
const CHUNK = 3500; // JSON-escaping can nearly double it; sync allows 8 KB per item
let backupTimer = null;
async function backupRankings() {
  const r = await getLocal('hda:rankings');
  if (!r || r.source === 'default' || !Array.isArray(r.players)) return;
  const slim = {
    players: r.players.map((p) => [p.name, p.tier, p.team || '', (p.pos || []).join('/'),
      (p.dontReach ? 'D' : '') + (p.injuryProne ? '*' : '') + (p.rookie ? 'R' : ''), p.note || '']),
    tierLabels: r.tierLabels || {}, sourceName: r.sourceName || '', basedOn: r.basedOn || '', importedAt: r.importedAt || Date.now(),
  };
  const text = JSON.stringify(slim);
  const items = { 'hda:bk:n': Math.ceil(text.length / CHUNK) };
  for (let i = 0; i * CHUNK < text.length; i++) items['hda:bk:' + i] = text.slice(i * CHUNK, (i + 1) * CHUNK);
  const old = (await chrome.storage.sync.get('hda:bk:n'))['hda:bk:n'] || 0;
  await chrome.storage.sync.set(items);
  const stale = [];
  for (let i = items['hda:bk:n']; i < old; i++) stale.push('hda:bk:' + i);
  if (stale.length) await chrome.storage.sync.remove(stale);
}

async function restoreRankingsIfMissing() {
  const local = await getLocal('hda:rankings');
  if (local && Array.isArray(local.players) && local.players.length) return;
  const n = (await chrome.storage.sync.get('hda:bk:n'))['hda:bk:n'];
  if (!n) return;
  const keys = Array.from({ length: n }, (_, i) => 'hda:bk:' + i);
  const got = await chrome.storage.sync.get(keys);
  let slim;
  try { slim = JSON.parse(keys.map((k) => got[k] || '').join('')); } catch (e) { return; }
  const players = slim.players.map(([name, tier, team, pos, flags, note], i) => {
    const p = { rank: i + 1, name, tier, team: team || null, pos: pos ? pos.split('/') : [] };
    if (flags.includes('D')) p.dontReach = true;
    if (flags.includes('*')) p.injuryProne = true;
    if (flags.includes('R')) p.rookie = true;
    if (note) p.note = note;
    return p;
  });
  await chrome.storage.local.set({ 'hda:rankings': { players, tierLabels: slim.tierLabels, source: 'edited',
    sourceName: slim.sourceName || 'Restored backup', basedOn: slim.basedOn, importedAt: slim.importedAt } });
}

chrome.runtime.onInstalled.addListener(() => { restoreRankingsIfMissing().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { restoreRankingsIfMissing().catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['hda:rankings']) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => backupRankings().catch(() => {}), 3000);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'hda-fetch') {
    let url;
    try { url = new URL(msg.url); } catch (e) { sendResponse({ ok: false, error: 'bad url' }); return false; }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      sendResponse({ ok: false, error: 'host not allowed' });
      return false;
    }
    fetch(url.href, { credentials: 'include', headers: msg.headers || {} })
      .then(async (r) => {
        if (!r.ok) return sendResponse({ ok: false, status: r.status, error: `ESPN returned ${r.status}` });
        sendResponse({ ok: true, json: await r.json() });
      })
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // async response
  }
  if (msg && msg.type === 'hda-open') {
    const page = msg.page === 'board' ? 'standalone/board.html' : 'options/options.html';
    chrome.tabs.create({ url: chrome.runtime.getURL(page) });
  }
  if (msg && msg.type === 'hda-phone-sync') {
    phoneSync(msg.mode).then(sendResponse, (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg && msg.type === 'hda-phone-synced') {
    // Leave the tab open a moment so a computer→phone push finishes saving.
    if (sender.tab && sender.tab.id === syncTabId) setTimeout(closeSyncTab, 4000);
  }
  return false;
});
