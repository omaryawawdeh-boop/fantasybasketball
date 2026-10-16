/*
 * Hoops Board: phone editor for the draft rankings. The list lives in this
 * page's shared store (doc "board/main"); the Draft Assistant extension syncs
 * with it whenever this page is open in Chrome on the computer (postMessage
 * bridge below), and pushes ESPN numbers into "board/stats" for display here.
 */
(function () {
  const E = HDA.rankEdit;
  const root = document.getElementById('root');
  const toastEl = document.getElementById('toast');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (n) => HDA.normalizeName(n);

  const state = {
    board: null,          // {players, tierLabels, updatedAt, updatedFrom}
    stats: null,          // {byName: {norm: {adp, proj, last, gp}}, updatedAt}
    loaded: false,
    canWrite: true,
    status: 'Connecting…',
    statusErr: false,
    q: '',
    open: null,           // rank whose tools are open
    confirmRemove: null,
    renaming: null,
    addName: '',
    addRank: '',
    pasteText: '',
  };
  const undo = [];
  let ref = null;
  let statsRef = null;
  let writing = false;
  let queued = false;

  // ---------- helpers ----------
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }
  const ago = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString();
  };
  function cleanBoard(b) {
    if (!b || !Array.isArray(b.players)) return null;
    const players = b.players
      .filter((p) => p && typeof p.name === 'string' && p.name.trim())
      .map((p) => {
        const o = { name: String(p.name).slice(0, 80), tier: Number(p.tier) || 1, team: p.team ? String(p.team).slice(0, 5) : null, pos: Array.isArray(p.pos) ? p.pos.map(String).slice(0, 5) : [] };
        for (const k of ['dontReach', 'injuryProne', 'rookie']) if (p[k]) o[k] = true;
        if (p.note) o.note = String(p.note).slice(0, 400);
        return o;
      });
    const labels = {};
    for (const [k, v] of Object.entries(b.tierLabels || {})) if (v) labels[k] = String(v).slice(0, 40);
    const n = E.normalize(players, labels);
    return { players: n.players, tierLabels: n.tierLabels, updatedAt: Number(b.updatedAt) || 0, updatedFrom: b.updatedFrom || '' };
  }

  // ---------- store ----------
  async function write() {
    if (!ref || !state.canWrite || !state.board) return;
    if (writing) { queued = true; return; }
    writing = true;
    state.status = 'Saving…';
    paintStatus();
    try {
      await ref.set(state.board);
      state.status = `Saved ${ago(state.board.updatedAt)}`;
      state.statusErr = false;
    } catch (e) {
      if (e && e.code === 'invalid_argument') {
        state.canWrite = false;
        state.status = 'Read-only: you can view this list but not change it';
      } else {
        state.status = 'Couldn’t save. Check your connection; your last change will retry.';
        queued = true;
      }
      state.statusErr = true;
    }
    writing = false;
    paintStatus();
    if (queued) { queued = false; setTimeout(write, 800); }
  }

  function commit(next, msg) {
    if (!state.canWrite) { toast('This list is read-only for you'); return; }
    // Unchanged? (A tier rename keeps the same players, so compare the names too.)
    if (!next || (state.board && next.players === state.board.players && JSON.stringify(next.tierLabels || {}) === JSON.stringify(state.board.tierLabels || {}))) return;
    if (state.board) undo.push(state.board);
    if (undo.length > 50) undo.shift();
    state.board = { players: next.players, tierLabels: next.tierLabels || {}, updatedAt: Date.now(), updatedFrom: 'phone' };
    render();
    write();
    bridgePost();
    if (msg) toast(msg);
  }

  // ---------- extension bridge (desktop Chrome only) ----------
  // The Draft Assistant extension runs a small script in this page's frame. It says
  // "hello", we answer with the list; whichever side changed last wins.
  function bridgePost() {
    window.postMessage({ __hdaSync: 'board', board: state.board, loaded: state.loaded, canWrite: state.canWrite }, '*');
  }
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || typeof ev.data.__hdaSync !== 'string') return;
    const m = ev.data;
    if (m.__hdaSync === 'hello') bridgePost();
    if (m.__hdaSync === 'push' && m.board && state.loaded && state.canWrite) {
      const incoming = cleanBoard(m.board);
      if (incoming && (!state.board || incoming.updatedAt > (state.board.updatedAt || 0))) {
        state.board = { ...incoming, updatedFrom: 'computer' };
        render();
        write();
        toast('Updated from your computer');
      }
    }
    if (m.__hdaSync === 'stats' && m.stats && statsRef && state.canWrite) {
      const byName = {};
      for (const [k, v] of Object.entries(m.stats.byName || {}).slice(0, 600)) {
        byName[k] = { adp: Number(v.adp) || null, proj: v.proj == null ? null : Number(v.proj), last: v.last == null ? null : Number(v.last), gp: v.gp == null ? null : Number(v.gp) };
      }
      const next = { byName, updatedAt: Number(m.stats.updatedAt) || Date.now() };
      if (!state.stats || next.updatedAt > (state.stats.updatedAt || 0)) statsRef.set(next).catch(() => {});
    }
  });

  // ---------- render ----------
  function paintStatus() {
    const el = root.querySelector('.status');
    if (!el) return;
    el.className = `status ${state.statusErr ? 'err' : ''}`;
    el.innerHTML = `<b>●</b> ${esc(state.status)}`;
  }

  function statLine(p) {
    const parts = [];
    const s = state.stats && state.stats.byName ? state.stats.byName[norm(p.name)] : null;
    const sheet = HDA.TIER_SHEET_STATS ? HDA.TIER_SHEET_STATS.byName.get(norm(p.name)) : null;
    if (s && s.adp) parts.push(`ADP <b>${s.adp}</b>`);
    else if (sheet && sheet.mkt) parts.push(`Mkt <b>#${sheet.mkt}</b>`);
    const last = s && s.last != null ? s.last : sheet && sheet.fp != null ? sheet.fp : null;
    const gp = s && s.gp != null ? s.gp : sheet && sheet.gp != null ? sheet.gp : null;
    if (last != null) parts.push(`Last <b>${last}</b>${gp != null ? ` (${gp} GP)` : ''}`);
    if (s && s.proj != null) parts.push(`Proj <b>${s.proj}</b>`);
    return parts.map((x) => `<span>${x}</span>`).join('');
  }

  function rowHtml(p) {
    const open = state.open === p.rank;
    const meta = [p.team, (p.pos || []).join('/')].filter(Boolean).join(' · ');
    let html = `<li class="row ${open ? 'open' : ''}">
      <button class="rk" data-act="toggle" data-arg="${p.rank}" aria-label="Rank ${p.rank}, tap for tools">${p.rank}</button>
      <div class="who" data-act="toggle" data-arg="${p.rank}">
        <div class="nm">${esc(p.name)}${p.injuryProne ? '<span class="b b-inj">INJ*</span>' : ''}${p.dontReach ? '<span class="b b-dr">DR</span>' : ''}${p.rookie ? '<span class="b b-rk">ROOKIE</span>' : ''}</div>
        <div class="sub">${meta ? `<span>${esc(meta)}</span>` : ''}${statLine(p)}</div>
      </div>
      <button class="more" data-act="toggle" data-arg="${p.rank}" aria-label="Tools for ${esc(p.name)}">${open ? '×' : '⋯'}</button>
    </li>`;
    if (open) {
      html += `<li class="tools">
        <div class="grp"><input id="moveto" inputmode="numeric" placeholder="#" aria-label="Move to rank"><button class="tool" data-act="moveTo" data-arg="${p.rank}">Move to #</button>
          <button class="tool" data-act="move" data-arg="${p.rank}|-1" aria-label="Up one">▲</button><button class="tool" data-act="move" data-arg="${p.rank}|1" aria-label="Down one">▼</button></div>
        <div class="grp"><button class="tool" data-act="tier" data-arg="${p.rank}|-1">Tier ↑</button><button class="tool" data-act="tier" data-arg="${p.rank}|1">Tier ↓</button><button class="tool" data-act="split" data-arg="${p.rank}">New tier starts here</button></div>
        <div class="grp"><button class="tool ${p.dontReach ? 'on dr' : ''}" data-act="flag" data-arg="${p.rank}|dontReach">DR</button><button class="tool ${p.injuryProne ? 'on inj' : ''}" data-act="flag" data-arg="${p.rank}|injuryProne">INJ*</button><button class="tool ${p.rookie ? 'on rk' : ''}" data-act="flag" data-arg="${p.rank}|rookie">Rookie</button>
          <button class="tool ${state.confirmRemove === p.rank ? 'confirm' : 'danger'}" data-act="remove" data-arg="${p.rank}">${state.confirmRemove === p.rank ? 'Tap again to remove' : 'Remove'}</button></div>
        ${p.note ? `<p class="sub" style="margin:2px 0 0">${esc(p.note)}</p>` : ''}
      </li>`;
    }
    return html;
  }

  function render() {
    const scroll = window.scrollY;
    let html = `<div class="top">
      <div class="bar"><h1>Hoops <span>Board</span></h1><div class="status"></div>
        <button class="btn" data-act="undo" ${undo.length ? '' : 'disabled'}>Undo</button></div>
      <input class="search" id="q" type="search" placeholder="Find a player" value="${esc(state.q)}" autocomplete="off">
    </div>`;
    if (!state.loaded) {
      html += '<div class="empty">Loading your board…</div>';
    } else if (!state.board || !state.board.players.length) {
      html += `<div class="card"><h2>No list here yet</h2>
        <p>Open the Draft Assistant on your computer and choose <b>Sync with phone</b>, or paste a list code below.</p></div>`;
    } else {
      if (!state.canWrite) html += '<div class="ro" style="margin-top:10px">You can view this list but not change it.</div>';
      const q = norm(state.q);
      const players = state.board.players;
      const labels = state.board.tierLabels || {};
      const tiers = [...new Set(players.map((p) => p.tier))];
      for (const t of tiers) {
        let rows = players.filter((p) => p.tier === t);
        const count = rows.length;
        if (q) rows = rows.filter((p) => norm(p.name).includes(q));
        if (!rows.length) continue;
        const renaming = state.renaming === t;
        html += `<section class="tier"><div class="th">
          <span class="tn">T${t}</span>
          ${renaming
            ? `<input id="tiername" value="${esc(state.renameText != null ? state.renameText : labels[t] || '')}" placeholder="Tier name" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--panel);font-size:16px"><button class="mini" data-act="renameSave" data-arg="${t}">Save</button>`
            : `<span class="tl">${esc(labels[t] || '')}</span><span class="tc">${count}</span>
               <button class="mini" data-act="rename" data-arg="${t}">Rename</button>${t > 1 ? `<button class="mini" data-act="merge" data-arg="${t}">Merge ↑</button>` : ''}`}
        </div><ol class="list">${rows.map(rowHtml).join('')}</ol></section>`;
      }
      if (q && !players.some((p) => norm(p.name).includes(q))) html += `<div class="empty">No one on your list matches “${esc(state.q)}”.</div>`;
    }
    html += `<div class="card"><h2>Add a player</h2>
      <div class="addrow"><input class="name" id="addname" placeholder="Player name" value="${esc(state.addName)}" autocomplete="off"><input class="at" id="addrank" inputmode="numeric" placeholder="at #" value="${esc(state.addRank)}"></div>
      <button class="btn primary" data-act="add">Add to my list</button>
      <p>Leave “at #” empty to add him at the bottom.</p></div>`;
    html += `<div class="card"><h2>Sync with your computer</h2>
      <p>Your list saves here automatically. The Draft Assistant extension picks it up when this page is open in Chrome on your computer (it can open it for you). Whichever side changed last wins.</p>
      <p>${state.board && state.board.updatedAt ? `Last change: ${esc(ago(state.board.updatedAt))}${state.board.updatedFrom ? ` (from your ${esc(state.board.updatedFrom)})` : ''}.` : ''}${state.stats && state.stats.updatedAt ? ` ESPN numbers from ${esc(ago(state.stats.updatedAt))}.` : ' ESPN numbers (ADP, projections) appear after your first sync.'}</p>
      <div class="addrow"><button class="btn" data-act="copy">Copy list code</button></div>
      <textarea id="paste" placeholder="Paste a list code from the extension here">${esc(state.pasteText)}</textarea>
      <button class="btn" data-act="paste">Use pasted list</button></div>`;
    root.innerHTML = html;
    paintStatus();
    window.scrollTo(0, scroll);
  }

  // ---------- actions ----------
  const P = () => state.board.players;
  const L = () => state.board.tierLabels || {};
  const actions = {
    toggle(arg) { const r = Number(arg); state.open = state.open === r ? null : r; state.confirmRemove = null; render(); },
    move(arg) { const [r, d] = arg.split('|').map(Number); commit(E.moveBy(P(), L(), r, d)); state.open = Math.max(1, Math.min(P().length, r + d)); render(); },
    moveTo(arg) {
      const from = Number(arg);
      const to = Number((root.querySelector('#moveto') || {}).value);
      if (!(to > 0)) { toast('Type the new rank first'); return; }
      commit(E.moveTo(P(), L(), from, to), `Moved to #${Math.min(to, P().length)}`);
      state.open = Math.min(to, P().length);
      render();
    },
    tier(arg) { const [r, d] = arg.split('|').map(Number); commit(E.changeTier(P(), L(), r, d)); state.open = null; render(); },
    split(arg) { commit(E.splitTier(P(), L(), Number(arg)), 'New tier started'); },
    merge(arg) { commit(E.mergeTier(P(), L(), Number(arg)), 'Tiers merged'); },
    rename(arg) { state.renaming = Number(arg); state.renameText = null; render(); const i = root.querySelector('#tiername'); if (i) i.focus(); },
    renameSave(arg) {
      const v = (root.querySelector('#tiername') || {}).value || '';
      state.renaming = null; state.renameText = null;
      commit(E.renameTier(P(), L(), Number(arg), v), v.trim() ? `Tier ${arg} renamed` : `Tier ${arg} name cleared`);
      render();
    },
    flag(arg) {
      const [r, f] = arg.split('|');
      if (f === 'rookie') {
        const players = P().map((p, i) => (i === Number(r) - 1 ? { ...p, rookie: !p.rookie || undefined } : p));
        commit({ players, tierLabels: L() });
      } else commit(E.toggleFlag(P(), L(), Number(r), f));
    },
    remove(arg) {
      const r = Number(arg);
      if (state.confirmRemove !== r) { state.confirmRemove = r; render(); return; }
      const name = P()[r - 1].name;
      state.confirmRemove = null;
      state.open = null;
      commit(E.removeAt(P(), L(), r), `Removed ${name}`);
    },
    add() {
      const name = state.addName.trim();
      if (name.length < 3) { toast('Type a player name'); return; }
      if (state.board && P().some((p) => norm(p.name) === norm(name))) { toast(`${name} is already on your list`); return; }
      const rank = Number(state.addRank) > 0 ? Number(state.addRank) : null;
      const base = state.board || { players: [], tierLabels: {} };
      state.addName = '';
      state.addRank = '';
      commit(E.insertAt(base.players, base.tierLabels, { name }, rank), `Added ${name}`);
    },
    undo() {
      const prev = undo.pop();
      if (!prev) return;
      state.board = { ...prev, updatedAt: Date.now(), updatedFrom: 'phone' };
      render();
      write();
      bridgePost();
      toast('Undone');
    },
    async copy() {
      if (!state.board) { toast('Nothing to copy yet'); return; }
      const code = 'HOOPSBOARD1:' + JSON.stringify({ players: P(), tierLabels: L(), updatedAt: state.board.updatedAt });
      try { await navigator.clipboard.writeText(code); toast('List code copied'); } catch (e) {
        const ta = root.querySelector('#paste');
        ta.value = code;
        ta.select();
        toast('Select-all and copy the code in the box');
      }
    },
    paste() {
      const text = (root.querySelector('#paste') || {}).value || '';
      const m = text.trim().match(/^HOOPSBOARD1:(.*)$/s);
      let b = null;
      try { b = m ? cleanBoard(JSON.parse(m[1])) : null; } catch (e) { b = null; }
      if (!b || !b.players.length) { toast('That isn’t a list code. Copy it again from the extension.'); return; }
      state.pasteText = '';
      commit({ players: b.players, tierLabels: b.tierLabels }, `Loaded ${b.players.length} players`);
    },
  };

  root.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    if (el.tagName === 'DIV' && ev.target.closest('button')) return;
    if (!state.board && !['add', 'paste', 'copy'].includes(el.dataset.act)) return;
    actions[el.dataset.act](el.dataset.arg);
  });
  root.addEventListener('input', (ev) => {
    const id = ev.target.id;
    if (id === 'q') {
      state.q = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const q = root.querySelector('#q');
      q.focus();
      try { q.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    } else if (id === 'addname') state.addName = ev.target.value;
    else if (id === 'addrank') state.addRank = ev.target.value;
    else if (id === 'paste') state.pasteText = ev.target.value;
    else if (id === 'tiername') state.renameText = ev.target.value; // survives a redraw while typing
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    if (ev.target.id === 'moveto') { const btn = root.querySelector('[data-act="moveTo"]'); if (btn) actions.moveTo(btn.dataset.arg); }
    if (ev.target.id === 'addname' || ev.target.id === 'addrank') actions.add();
    if (ev.target.id === 'tiername') { const btn = root.querySelector('[data-act="renameSave"]'); if (btn) actions.renameSave(btn.dataset.arg); }
  });
  setInterval(() => { if (state.board && !writing && !state.statusErr) { state.status = `Saved ${ago(state.board.updatedAt)}`; paintStatus(); } }, 30000);

  // ---------- boot ----------
  render();
  (async () => {
    const use = window.claude && window.claude.use;
    const db = use ? await window.claude.use('db') : null;
    if (!db) {
      state.loaded = true;
      state.canWrite = false;
      state.status = 'Open this page signed in to claude.ai to load your list';
      state.statusErr = true;
      render();
      return;
    }
    const user = await window.claude.use('user');
    const can = user ? await user.can('data.write') : null;
    if (can === false) state.canWrite = false;
    ref = db.doc('board/main');
    statsRef = db.doc('board/stats');
    ref.onSnapshot((snap) => {
      state.loaded = true;
      const b = snap.exists ? cleanBoard(snap.data()) : null;
      // Keep our own newer local edit if a stale snapshot arrives mid-save.
      if (!(state.board && b && b.updatedAt < state.board.updatedAt)) state.board = b;
      if (!writing) { state.status = state.board ? `Saved ${ago(state.board.updatedAt)}` : 'No list yet'; state.statusErr = false; }
      render();
      bridgePost();
    }, () => {
      state.loaded = true;
      state.status = 'Lost connection to your list. Reload the page.';
      state.statusErr = true;
      render();
    });
    statsRef.onSnapshot((snap) => { state.stats = snap.exists ? snap.data() : null; render(); }, () => {});
  })();
})();
