/*
 * Sync with the "Hoops Board" phone page. Runs in claude.ai frames, but only
 * does anything inside a page that carries <meta name="hoops-draft-sync">.
 * The page answers "hello" with its list; whichever side changed last wins:
 *   phone newer    -> saved into the extension (chrome.storage 'hda:rankings')
 *   computer newer -> pushed to the page, which saves it online
 * ESPN numbers the extension has seen (ADP, projections) are pushed too, so the
 * phone can show them.
 */
(function () {
  if (window.__hdaPhoneBridge) return;
  window.__hdaPhoneBridge = true;

  const marker = () => document.querySelector('meta[name="hoops-draft-sync"]');
  const get = async (k) => (await chrome.storage.local.get(k))[k];
  let started = false;
  let lastSeenRemoteAt = 0;
  let pageCanWrite = false;
  let reported = false;

  function localStamp(local) {
    return local && local.source !== 'default' && Array.isArray(local.players) && local.players.length ? Number(local.importedAt) || 1 : 0;
  }

  function toPage(local) {
    return {
      players: local.players.map((p) => {
        const o = { name: p.name, tier: p.tier, team: p.team || null, pos: p.pos || [] };
        for (const k of ['dontReach', 'injuryProne', 'rookie']) if (p[k]) o[k] = true;
        if (p.note) o.note = p.note;
        return o;
      }),
      tierLabels: local.tierLabels || {},
      updatedAt: Number(local.importedAt) || Date.now(),
    };
  }

  async function report(direction) {
    await chrome.storage.local.set({ 'hda:phoneSync': { at: Date.now(), direction } });
    if (!reported) { reported = true; chrome.runtime.sendMessage({ type: 'hda-phone-synced', direction }).catch(() => {}); }
  }

  async function reconcile(remote) {
    const local = await get('hda:rankings');
    const localAt = localStamp(local);
    const remoteAt = remote && Array.isArray(remote.players) && remote.players.length ? Number(remote.updatedAt) || 1 : 0;
    lastSeenRemoteAt = Math.max(lastSeenRemoteAt, remoteAt);
    if (remoteAt && remoteAt > localAt) {
      await chrome.storage.local.set({
        'hda:rankings': {
          players: remote.players.map((p, i) => ({ ...p, rank: i + 1 })),
          tierLabels: remote.tierLabels || {},
          source: 'edited',
          sourceName: 'Phone list',
          basedOn: (local && local.basedOn) || 'Phone list',
          importedAt: remoteAt,
        },
      });
      await report('phone → computer');
    } else if (localAt > remoteAt && pageCanWrite) {
      window.postMessage({ __hdaSync: 'push', board: toPage(local) }, '*');
      lastSeenRemoteAt = localAt;
      await report('computer → phone');
    } else {
      await report('already in sync');
    }
    const stats = await get('hda:espnStats');
    if (stats && pageCanWrite) window.postMessage({ __hdaSync: 'stats', stats }, '*');
  }

  function start() {
    if (started || !marker()) return;
    started = true;
    window.addEventListener('message', (ev) => {
      const m = ev.data;
      if (ev.source !== window || !m || m.__hdaSync !== 'board' || !m.loaded) return;
      pageCanWrite = !!m.canWrite;
      reconcile(m.board).catch(() => {});
    });
    // The page may still be loading its list: say hello until it answers.
    let tries = 0;
    const hello = setInterval(() => {
      if (lastSeenRemoteAt || reported || ++tries > 20) { clearInterval(hello); return; }
      window.postMessage({ __hdaSync: 'hello' }, '*');
    }, 1500);
    window.postMessage({ __hdaSync: 'hello' }, '*');
    // Edits made on the computer while this page is open go straight up.
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || !changes['hda:rankings']) return;
      const local = changes['hda:rankings'].newValue;
      if (localStamp(local) > lastSeenRemoteAt && pageCanWrite) {
        lastSeenRemoteAt = localStamp(local);
        window.postMessage({ __hdaSync: 'push', board: toPage(local) }, '*');
      }
    });
  }

  if (marker()) start();
  else {
    const obs = new MutationObserver(() => { if (marker()) { obs.disconnect(); start(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  }
})();
