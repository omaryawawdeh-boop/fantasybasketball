/*
 * The draft assistant panel. One controller + renderer used in two places:
 *   - inside ESPN's draft room (content script, synced from ESPN's API)
 *   - the standalone manual board (standalone/board.html)
 * Rendering is plain DOM inside a shadow root so ESPN's CSS can't leak in.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  // ---------- storage (chrome.storage when available, else localStorage) ----------
  const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const storage = {
    async get(key, fallback) {
      try {
        if (hasChromeStorage) {
          const r = await chrome.storage.local.get(key);
          return r[key] !== undefined ? r[key] : fallback;
        }
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    async set(key, value) {
      try {
        if (hasChromeStorage) await chrome.storage.local.set({ [key]: value });
        else localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* storage full or blocked: keep running in memory */ }
    },
  };

  function defaultSettings() {
    const L = HDA.DEFAULT_LEAGUE || {};
    return {
      teams: L.teams || 12,
      rounds: L.rounds || 13,
      mySlot: 1,
      rosterSlots: { ...(L.rosterSlots || HDA.DEFAULT_ROSTER) },
      scoringWeights: { ...(L.scoringWeights || HDA.SCORING_PRESETS.espn_points.weights) },
      useLeagueScoring: true,
      syncMode: 'auto', // auto | manual
      leagueId: L.espnLeagueId || null,
      myTeamIds: {}, // ESPN leagueId -> your teamId (set in Options)
      side: 'right',
    };
  }

  async function loadRankings() {
    const saved = await storage.get('hda:rankings', null);
    if (saved && Array.isArray(saved.players) && saved.players.length) return saved;
    return { players: HDA.DEFAULT_RANKINGS || [], tierLabels: HDA.DEFAULT_TIER_LABELS || {}, source: 'default' };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtAgo = (t) => {
    if (!t) return 'never';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return new Date(t).toLocaleTimeString();
  };

  /**
   * @param {object} o
   * @param {HTMLElement} o.host element to attach the shadow root to
   * @param {'espn'|'standalone'} o.mode
   * @param {string} o.draftId key for this draft's local state (league id or 'standalone')
   * @param {number|null} [o.myTeamId]
   * @param {boolean} [o.sync] true when an ESPN sync loop feeds this app
   */
  async function createApp({ host, mode, draftId, myTeamId = null, sync = mode === 'espn' }) {
    const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    const state = {
      settings: { ...defaultSettings(), ...(await storage.get('hda:settings', {})) },
      rankings: await loadRankings(),
      local: await storage.get(`hda:draft:${draftId}`, { picks: [], taken: [], mineOverrides: {} }),
      ui: { tab: 'pick', search: '', hideDrafted: false, collapsed: false, openTiers: {}, ...(await storage.get('hda:ui', {})) },
      espn: { league: null, players: [], status: sync ? 'connecting' : 'off', message: '', lastOk: null },
      myTeamId,
    };
    let board = null;
    let boardSig = '';

    const persistLocal = () => storage.set(`hda:draft:${draftId}`, state.local);
    const persistUi = () => storage.set('hda:ui', { tab: state.ui.tab, hideDrafted: state.ui.hideDrafted, collapsed: state.ui.collapsed });

    function scoringItems() {
      const L = state.espn.league;
      if (state.settings.useLeagueScoring && L && L.scoringType && /POINTS/.test(L.scoringType) && L.scoringItems.length) return L.scoringItems;
      return HDA.weightsToItems(state.settings.scoringWeights);
    }

    function getBoard() {
      const sig = `${state.rankings.players.length}|${state.rankings.importedAt || state.rankings.source}|${state.espn.players.length}|${state.espn.playersAt || 0}|${JSON.stringify(scoringItems())}`;
      if (!board || sig !== boardSig) {
        board = HDA.buildBoard({ rankings: state.rankings.players, espnPlayers: state.espn.players, scoringItems: scoringItems() });
        boardSig = sig;
      }
      return board;
    }

    function espnLive() {
      return sync && state.settings.syncMode !== 'manual' && state.espn.status === 'ok' && state.espn.league;
    }

    function compute() {
      const b = getBoard();
      const L = state.espn.league;
      const live = espnLive();
      const teams = (L && L.size) || state.settings.teams;
      const rounds = (L && L.rounds) || state.settings.rounds;
      const rosterSlots = (L && L.rosterSlots) || state.settings.rosterSlots;
      const picks = live ? L.draft.picks : state.local.picks;
      const draft = HDA.computeDraft({
        board: b,
        picks,
        teams,
        rounds,
        mySlot: state.settings.mySlot,
        myTeamId: live ? state.myTeamId : null,
        pickOrder: L ? L.pickOrder : [],
        snake: !L || !L.draftType || L.draftType === 'SNAKE',
        mineOverrides: state.local.mineOverrides,
      });
      // Players marked "taken" by hand while ESPN sync is on (e.g. ESPN lagging).
      if (live) for (const k of state.local.taken) if (!draft.drafted.has(k) && b.byKey.has(k)) draft.drafted.set(k, { overall: null, teamId: null, mine: false, manual: true });
      const sug = HDA.suggest({ board: b, draft, rosterSlots });
      return { board: b, draft, sug, rosterSlots, live, teams, rounds };
    }

    // ---------- actions ----------
    const actions = {
      tab(t) { state.ui.tab = t; persistUi(); render(); },
      collapse() { state.ui.collapsed = !state.ui.collapsed; persistUi(); render(); },
      hideDrafted() { state.ui.hideDrafted = !state.ui.hideDrafted; persistUi(); render(); },
      toggleTier(t) {
        const g = HDA.tiers(compute().board, compute().draft).find((x) => String(x.tier) === String(t));
        const isOpen = state.ui.openTiers[t] != null ? state.ui.openTiers[t] : !!(g && g.left > 0);
        state.ui.openTiers[t] = !isOpen;
        render();
      },
      take(key) {
        const c = compute();
        if (c.draft.drafted.has(key)) return actions.untake(key);
        if (c.live) state.local.taken.push(key);
        else state.local.picks.push({ overall: c.draft.currentPick, key });
        persistLocal(); render();
      },
      untake(key) {
        state.local.taken = state.local.taken.filter((k) => k !== key);
        const i = state.local.picks.findIndex((p) => p.key === key);
        if (i >= 0) {
          // Removing a pick from the middle re-sequences the picks after it.
          state.local.picks.splice(i, 1);
          state.local.picks.forEach((p, j) => { p.overall = j + 1; });
        }
        delete state.local.mineOverrides[key];
        persistLocal(); render();
      },
      undo() {
        if (state.local.picks.length) state.local.picks.pop();
        else state.local.taken.pop();
        persistLocal(); render();
      },
      toggleMine(key) {
        const c = compute();
        const d = c.draft.drafted.get(key);
        const now = d ? d.mine : false;
        state.local.mineOverrides[key] = !now;
        if (!d && !c.live) state.local.picks.push({ overall: c.draft.currentPick, key });
        persistLocal(); render();
      },
      resetDraft() {
        if (!confirm('Clear all picks you tracked for this draft? (ESPN-synced picks are unaffected.)')) return;
        state.local = { picks: [], taken: [], mineOverrides: {} };
        persistLocal(); render();
      },
      setting(name, value) {
        state.settings[name] = value;
        storage.set('hda:settings', state.settings);
        render();
      },
      options() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: 'hda-open', page: 'options' });
        else location.href = '../options/options.html';
      },
      retry() { if (api.onRetry) api.onRetry(); },
    };

    // ---------- render ----------
    shadow.innerHTML = `<style>${CSS}</style><div class="hda" part="panel"></div>`;
    const rootEl = shadow.querySelector('.hda');

    rootEl.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      const fn = actions[el.dataset.act];
      if (fn) fn(el.dataset.arg);
    });
    rootEl.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.dataset.search != null) {
        state.ui.search = el.value;
        renderBody();
        return;
      }
      if (el.dataset.setting) {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        if (el.dataset.setting === 'syncMode') v = el.checked ? 'manual' : 'auto';
        if (el.type === 'number' && (!v || v < 1)) return;
        state.settings[el.dataset.setting] = v;
        storage.set('hda:settings', state.settings);
        if (el.dataset.setting === 'syncMode') render();
        else renderBody(true);
      }
    });
    rootEl.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // keep ESPN hotkeys from firing while typing in the panel
      if (ev.key === 'Enter' && ev.target.dataset.search != null) {
        const first = rootEl.querySelector('[data-first-hit]');
        if (first) { actions.take(first.dataset.firstHit); ev.target.select(); }
      }
    });

    function render() {
      rootEl.className = mode === 'standalone' ? 'hda standalone' : `hda side-${state.settings.side}${state.ui.collapsed ? ' collapsed' : ''}`;
      if (state.ui.collapsed && mode !== 'standalone') {
        const c = compute();
        const top = c.sug.suggestions[0];
        rootEl.innerHTML = `<button class="tab-handle" data-act="collapse" title="Open draft assistant (Alt+Shift+D)">
          <span class="dot ${statusClass()}"></span><b>DRAFT</b>${top ? `<span class="handle-top">${esc(top.player.name)}</span>` : ''}</button>`;
        return;
      }
      const focus = shadow.activeElement;
      const searchFocused = focus && focus.dataset && focus.dataset.search != null;
      rootEl.innerHTML = `${renderHeader()}<div class="body"></div>`;
      renderBody();
      if (searchFocused) {
        const s = rootEl.querySelector('[data-search]');
        if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      }
    }

    function renderBody(keepFocus) {
      const body = rootEl.querySelector('.body');
      if (!body) return;
      const active = keepFocus && shadow.activeElement && shadow.activeElement.dataset && shadow.activeElement.dataset.setting;
      const c = compute();
      const status = rootEl.querySelector('.clock');
      if (status) status.outerHTML = renderClock(c);
      const tabs = { pick: renderPick, tiers: renderTiers, team: renderTeam, picks: renderPicks }[state.ui.tab] || renderPick;
      body.innerHTML = tabs(c);
      if (active) {
        const el = rootEl.querySelector(`[data-setting="${active}"]`);
        if (el) el.focus();
      }
    }

    function statusClass() {
      if (!sync) return 'manual';
      if (state.settings.syncMode === 'manual') return 'manual';
      return { ok: 'ok', connecting: 'wait', error: 'bad', dom: 'warn' }[state.espn.status] || 'manual';
    }

    function statusText() {
      if (!sync) return 'Manual tracking';
      if (state.settings.syncMode === 'manual') return 'Manual mode (sync off)';
      const s = state.espn.status;
      if (s === 'ok') {
        const L = state.espn.league;
        const waiting = L && !L.draft.inProgress && !L.draft.complete && !L.draft.picks.length;
        if (waiting) return `Connected to ${L.name || 'ESPN'} \u00b7 draft hasn\u2019t started${L.draftDate ? ` (${new Date(L.draftDate).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})` : ''}`;
        return `Synced with ESPN \u00b7 ${fmtAgo(state.espn.lastOk)}`;
      }
      if (s === 'connecting') return 'Connecting to ESPN…';
      if (s === 'dom') return 'Reading picks from the page (ESPN API unavailable)';
      return 'ESPN sync failed — tracking manually';
    }

    function renderHeader() {
      return `<header>
        <div class="row1">
          <div class="brand">Draft Assistant</div>
          <div class="hbtns">
            <button class="ghost" data-act="options" title="Rankings & settings">⚙</button>
            ${mode === 'espn' ? '<button class="ghost" data-act="collapse" title="Minimize (Alt+Shift+D)">–</button>' : ''}
          </div>
        </div>
        <div class="sync ${statusClass()}" title="${esc(state.espn.message)}"><span class="dot"></span>${esc(statusText())}
          ${state.espn.status === 'error' ? '<button class="link" data-act="retry">retry</button>' : ''}</div>
        <div class="clock"></div>
        <nav>
          ${[['pick', 'Suggestions'], ['tiers', 'My Tiers'], ['team', 'My Team'], ['picks', 'Picks']].map(([k, l]) => `<button class="${state.ui.tab === k ? 'on' : ''}" data-act="tab" data-arg="${k}">${l}</button>`).join('')}
        </nav>
      </header>`;
    }

    function renderClock(c) {
      const d = c.draft;
      if (d.complete) return `<div class="clock done">Draft complete — ${d.myPlayers.length} players on your team</div>`;
      const where = `Pick <b>${d.currentPick}</b> · Round ${d.currentRound}`;
      if (!d.mySlot) return `<div class="clock">${where} · <span class="muted">set your draft slot in My Team</span></div>`;
      if (d.onClock) return `<div class="clock me"><span class="pulse"></span>YOU'RE ON THE CLOCK · ${where}</div>`;
      return `<div class="clock">${where} · You pick <b>#${d.myNextPick}</b> in <b>${d.picksAway}</b></div>`;
    }

    function badges(p) {
      let out = '';
      if (p.injury) out += `<span class="b b-out" title="ESPN status">${esc(p.injury === 'DAY_TO_DAY' ? 'DTD' : p.injury.replace(/_/g, ' '))}</span>`;
      if (p.injuryProne) out += '<span class="b b-inj" title="Injury prone (*)">INJ*</span>';
      if (p.dontReach) out += '<span class="b b-dr" title="Don’t Reach: market ADP is later, you like him here">DR</span>';
      if (p.rookie) out += '<span class="b b-rk">ROOKIE</span>';
      return out;
    }

    function meta(p) {
      return `${esc(p.team || '')}${p.team && p.pos.length ? ' · ' : ''}${esc((p.pos || []).join('/'))}`;
    }

    function stats(p) {
      const parts = [];
      if (p.adp) parts.push(`<span title="ESPN average draft position">ADP ${p.adp}</span>`);
      if (p.fppg != null) parts.push(`<span title="${esc(p.statSource || '')} in your scoring">${p.fppg} FP/G</span>`);
      return parts.join('');
    }

    function renderPick(c) {
      const { sug, draft } = c;
      if (!sug.suggestions.length) {
        return `<div class="empty">${getBoard().players.length ? 'Everyone on your board is gone. Check the Picks tab or import a deeper list.' : 'No rankings loaded. Open ⚙ to import your list.'}</div>`;
      }
      const [top, ...rest] = sug.suggestions;
      const noteHtml = (s) => s.notes.map((n) => `<li class="n-${n.kind}">${esc(n.text)}</li>`).join('');
      let html = '';
      if (!sug.usingList) html += '<div class="warnbox">Your list is exhausted — showing ESPN rank order.</div>';
      html += `<div class="top ${draft.onClock ? 'hot' : ''}">
        <div class="top-l">
          <div class="kicker">${draft.onClock ? 'Take' : 'Best available'} · your #${top.player.myRank || '–'}${top.player.tier != null ? ` · Tier ${top.player.tier}` : ''}</div>
          <div class="top-name">${esc(top.player.name)} ${badges(top.player)}</div>
          <div class="sub">${meta(top.player)} ${stats(top.player)}</div>
          ${top.player.note ? `<div class="pnote">${esc(top.player.note)}</div>` : ''}
          <ul class="notes">${noteHtml(top)}</ul>
        </div>
        <button class="act" data-act="take" data-arg="${esc(top.player.key)}" title="Mark as drafted">${c.live ? 'Taken' : 'Drafted'}</button>
      </div>`;
      html += '<div class="sec">Next on your board</div><ol class="list">';
      for (const s of rest) {
        html += `<li class="prow">
          <span class="rk">${s.player.myRank || ''}</span>
          <div class="who"><div class="nm">${esc(s.player.name)} ${badges(s.player)}</div>
          <div class="sub">${meta(s.player)} ${stats(s.player)}</div>
          ${s.notes.length ? `<div class="mini">${s.notes.filter((n) => n.kind !== 'inj' && n.kind !== 'dr').map((n) => `<span class="n-${n.kind}">${esc(n.text)}</span>`).join('')}</div>` : ''}</div>
          <button class="sm" data-act="take" data-arg="${esc(s.player.key)}" title="Mark as drafted">✓</button>
          <button class="sm" data-act="toggleMine" data-arg="${esc(s.player.key)}" title="I drafted him">Me</button>
        </li>`;
      }
      html += '</ol>';
      if (sug.likelyAtNext.length && !draft.complete) {
        html += `<div class="sec">Probably still there at #${draft.myFollowingPick}</div><div class="chips">${sug.likelyAtNext.map((x) => `<span class="chip">${esc(x.player.name)} <i>${Math.round(x.pAvail * 100)}%</i></span>`).join('')}</div>`;
        html += '<div class="foot">Availability % is an estimate from ESPN ADP (normal spread around ADP), not a guarantee.</div>';
      }
      return html;
    }

    function renderSearch() {
      return `<div class="search"><input data-search placeholder="Find player — Enter marks first match drafted" value="${esc(state.ui.search)}"></div>`;
    }

    function renderTiers(c) {
      const q = HDA.normalizeName(state.ui.search);
      const groups = HDA.tiers(c.board, c.draft);
      const labels = state.rankings.tierLabels || {};
      let firstHit = null;
      let html = `${renderSearch()}<div class="tools"><label><input type="checkbox" ${state.ui.hideDrafted ? 'checked' : ''} data-act="hideDrafted"> Hide drafted</label></div>`;
      if (!groups.length) return html + '<div class="empty">No rankings loaded. Open ⚙ to import your list.</div>';
      for (const g of groups) {
        let rows = g.players;
        if (q) rows = rows.filter((p) => HDA.normalizeName(p.name).includes(q));
        if (state.ui.hideDrafted) rows = rows.filter((p) => !p.drafted || p.mine);
        if (!rows.length && (q || state.ui.hideDrafted)) continue;
        // Fully drafted tiers fold away unless you open them (searching opens everything).
        const open = q ? true : state.ui.openTiers[g.tier] != null ? state.ui.openTiers[g.tier] : g.left > 0;
        const pct = Math.round((g.left / g.players.length) * 100);
        html += `<section class="tier ${g.left === 0 ? 'empty-tier' : ''}">
          <div class="th" data-act="toggleTier" data-arg="${g.tier}">
            <span class="tn">T${g.tier}</span><span class="tl">${esc(labels[g.tier] || '')}</span>
            <span class="tleft ${g.left <= 2 && g.left > 0 ? 'low' : ''}">${g.left}/${g.players.length} left</span>
            <span class="meter"><i style="width:${pct}%"></i></span>
          </div>`;
        if (open) {
          html += '<ol class="list">';
          for (const p of rows) {
            if (!p.drafted && !firstHit && q) firstHit = p.key;
            html += `<li class="prow ${p.drafted ? 'gone' : ''} ${p.mine ? 'mine' : ''}" ${!p.drafted && firstHit === p.key ? `data-first-hit="${esc(p.key)}"` : ''}>
              <span class="rk">${p.myRank}</span>
              <div class="who"><div class="nm">${esc(p.name)} ${badges(p)}</div><div class="sub">${meta(p)} ${stats(p)}${p.overall ? `<span>pick ${p.overall}</span>` : ''}</div></div>
              <button class="sm" data-act="take" data-arg="${esc(p.key)}" title="${p.drafted ? 'Undo' : 'Mark as drafted'}">${p.drafted ? '↺' : '✓'}</button>
              <button class="sm ${p.mine ? 'on' : ''}" data-act="toggleMine" data-arg="${esc(p.key)}" title="Mine">Me</button>
            </li>`;
          }
          html += '</ol>';
        }
        html += '</section>';
      }
      if (q) {
        // Off-list players (ESPN pool) so anyone can be marked.
        const extra = c.board.players.filter((p) => !p.onList && HDA.normalizeName(p.name).includes(q)).slice(0, 8);
        if (extra.length) {
          html += '<div class="sec">Not on your list</div><ol class="list">';
          for (const p of extra) {
            const d = c.draft.drafted.get(p.key);
            if (!d && !firstHit) firstHit = p.key;
            html += `<li class="prow ${d ? 'gone' : ''}" ${!d && firstHit === p.key ? `data-first-hit="${esc(p.key)}"` : ''}><span class="rk"></span>
              <div class="who"><div class="nm">${esc(p.name)} ${badges(p)}</div><div class="sub">${meta(p)} ${stats(p)}</div></div>
              <button class="sm" data-act="take" data-arg="${esc(p.key)}">${d ? '↺' : '✓'}</button>
              <button class="sm" data-act="toggleMine" data-arg="${esc(p.key)}">Me</button></li>`;
          }
          html += '</ol>';
        }
      }
      return html;
    }

    function renderTeam(c) {
      const { draft, sug, rosterSlots } = c;
      const fit = sug.rosterFit;
      const openCount = {};
      for (const s of fit.open) openCount[s] = (openCount[s] || 0) + 1;
      const slotChips = Object.entries(rosterSlots)
        .filter(([s]) => s !== 'IR')
        .map(([s, n]) => {
          const open = openCount[s] || 0;
          const flex = s === 'UTIL' || s === 'BE';
          return `<span class="slot ${flex ? 'flex' : open ? 'open' : 'ok'}">${s}${n > 1 ? `×${n}` : ''}${!flex && open ? ' • need' : ''}</span>`;
        }).join('');
      const pc = sug.positionCounts;
      const total = draft.myPlayers.reduce((a, p) => a + (p.fppg || 0), 0);
      let html = `<div class="sec">Starting slots</div><div class="slots">${slotChips}</div>
        <div class="poscount">${Object.entries(pc).map(([k, v]) => `<span><b>${v}</b> ${k}</span>`).join('')}</div>
        <div class="sec">Roster (${draft.myPlayers.length}/${draft.rounds})${total ? ` · ${Math.round(total * 10) / 10} FP/G total` : ''}</div>`;
      if (!draft.myPlayers.length) html += '<div class="empty small">No picks yet.</div>';
      else {
        html += '<ol class="list">';
        for (const p of draft.myPlayers) {
          html += `<li class="prow mine"><span class="rk">${p.overall || ''}</span><div class="who"><div class="nm">${esc(p.name)} ${badges(p)}</div>
            <div class="sub">${meta(p)} ${p.myRank ? `<span>your #${p.myRank}</span>` : ''} ${p.fppg != null ? `<span>${p.fppg} FP/G</span>` : ''}</div></div>
            <button class="sm" data-act="toggleMine" data-arg="${esc(p.key)}" title="Not mine">✕</button></li>`;
        }
        html += '</ol>';
      }
      const L = state.espn.league;
      html += `<div class="sec">Draft setup</div><div class="setup">
        ${L && c.live ? `<div class="muted">From ESPN: ${L.size} teams, ${L.rounds} rounds${state.myTeamId != null && draft.mySlot ? `, you pick ${draft.mySlot}${['st', 'nd', 'rd'][draft.mySlot - 1] || 'th'}` : ''}.</div>` : `
        <label>Teams <input type="number" min="2" max="30" data-setting="teams" value="${state.settings.teams}"></label>
        <label>Rounds <input type="number" min="1" max="30" data-setting="rounds" value="${state.settings.rounds}"></label>`}
        ${!(c.live && state.myTeamId != null) ? `<label>My draft slot <input type="number" min="1" max="30" data-setting="mySlot" value="${state.settings.mySlot}"></label>` : ''}
        ${sync ? `<label><input type="checkbox" data-setting="syncMode" ${state.settings.syncMode === 'manual' ? 'checked' : ''}> Turn off ESPN sync (track by hand)</label>` : ''}
        <div class="btnrow"><button class="ghostbtn" data-act="undo">Undo last mark</button><button class="ghostbtn danger" data-act="resetDraft">Reset tracked picks</button></div>
      </div>`;
      return html;
    }

    function renderPicks(c) {
      const { draft, board: b } = c;
      const L = state.espn.league;
      const teamName = (id) => {
        if (!L || id == null) return '';
        const t = L.teams.find((x) => x.id === id);
        return t ? t.abbrev || t.name : `Team ${id}`;
      };
      const rows = [...draft.drafted.entries()].map(([key, d]) => ({ p: b.byKey.get(key), d })).sort((a, z) => (z.d.overall ?? 1e9) - (a.d.overall ?? 1e9));
      let html = `${renderSearch()}`;
      if (draft.unresolved.length) html += `<div class="warnbox">${draft.unresolved.length} ESPN pick(s) couldn’t be matched to a player (player list not loaded yet).</div>`;
      if (!rows.length) return html + '<div class="empty">No picks yet. Picks sync from ESPN automatically; otherwise use ✓ to mark players drafted.</div>';
      html += `<div class="tools"><button class="ghostbtn" data-act="undo">Undo last mark</button></div><ol class="list">`;
      for (const { p, d } of rows.slice(0, 60)) {
        html += `<li class="prow ${d.mine ? 'mine' : ''}"><span class="rk">${d.overall || '–'}</span>
          <div class="who"><div class="nm">${esc(p.name)} ${badges(p)}</div><div class="sub">${meta(p)} ${p.myRank ? `<span>your #${p.myRank}</span>` : '<span>off your list</span>'} ${teamName(d.teamId) ? `<span>${esc(teamName(d.teamId))}</span>` : ''}${d.manual ? '<span>marked by you</span>' : ''}</div></div>
          ${!c.live || d.manual ? `<button class="sm" data-act="untake" data-arg="${esc(p.key)}" title="Undo">↺</button>` : ''}
          <button class="sm ${d.mine ? 'on' : ''}" data-act="toggleMine" data-arg="${esc(p.key)}">Me</button></li>`;
      }
      return html + '</ol>';
    }

    // Keep "synced Xs ago" fresh.
    setInterval(() => { if (!state.ui.collapsed) { const s = rootEl.querySelector('.sync'); if (s && sync) { renderSyncOnly(); } } }, 5000);
    function renderSyncOnly() {
      const s = rootEl.querySelector('.sync');
      if (!s) return;
      s.className = `sync ${statusClass()}`;
      s.title = state.espn.message;
      s.innerHTML = `<span class="dot"></span>${esc(statusText())}${state.espn.status === 'error' ? ' <button class="link" data-act="retry">retry</button>' : ''}`;
    }

    // Live updates from storage (options page re-import, another tab).
    if (hasChromeStorage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(async (changes) => {
        if (changes['hda:rankings']) { state.rankings = await loadRankings(); board = null; render(); }
        if (changes['hda:settings']) { state.settings = { ...defaultSettings(), ...changes['hda:settings'].newValue }; render(); }
      });
    }

    const api = {
      state,
      render,
      compute,
      onRetry: null,
      setEspn(patch) {
        const prevSig = state.espn.league ? JSON.stringify(state.espn.league.draft.picks.map((p) => p.overall + ':' + p.espnId)) : '';
        Object.assign(state.espn, patch);
        if (patch.players) { state.espn.playersAt = Date.now(); board = null; }
        const sig = state.espn.league ? JSON.stringify(state.espn.league.draft.picks.map((p) => p.overall + ':' + p.espnId)) : '';
        if (patch.players || sig !== prevSig || patch.status) render();
        else renderSyncOnly();
      },
      /** Page-read fallback: add newly seen drafted players as sequential picks. */
      addDetected(keys) {
        const c = compute();
        let n = c.draft.currentPick;
        let changed = false;
        for (const k of keys) {
          if (c.draft.drafted.has(k) || state.local.picks.some((p) => p.key === k)) continue;
          state.local.picks.push({ overall: n++, key: k });
          changed = true;
        }
        if (changed) { persistLocal(); render(); }
      },
      toggle() { actions.collapse(); },
    };
    render();
    return api;
  }

  const CSS = `
:host{all:initial}
.hda{--bg:#101318;--panel:#171b22;--panel2:#1d222b;--line:#2a303b;--ink:#e9ecf1;--muted:#8d95a3;--accent:#ff7a3d;--good:#3ecf8e;--bad:#ff6b61;--warn:#f2c14e;--mine:#6f9bff;--mine-soft:#1c2846;
  position:fixed;top:0;bottom:0;width:380px;z-index:2147483646;background:var(--bg);color:var(--ink);font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  display:flex;flex-direction:column;box-shadow:0 0 24px rgba(0,0,0,.45);border-left:1px solid var(--line);box-sizing:border-box}
.hda *{box-sizing:border-box}
.hda.side-right{right:0}.hda.side-left{left:0;border-left:0;border-right:1px solid var(--line)}
.hda.standalone{position:static;width:auto;min-height:100vh;box-shadow:none;border:0;max-width:760px;margin:0 auto}
.hda.collapsed{top:auto;bottom:16px;width:auto;height:auto;background:transparent;box-shadow:none;border:0}
.tab-handle{display:flex;gap:8px;align-items:center;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:10px 0 0 10px;padding:10px 12px;font:inherit;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.4)}
.handle-top{color:var(--accent);font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button{font:inherit;color:inherit;cursor:pointer}
header{padding:10px 12px 0;border-bottom:1px solid var(--line);background:var(--panel)}
.row1{display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:14px}
.brand::before{content:"● ";color:var(--accent)}
.ghost{background:transparent;border:0;color:var(--muted);font-size:16px;padding:2px 6px;border-radius:6px}.ghost:hover{color:var(--ink);background:var(--panel2)}
.sync{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-top:4px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);display:inline-block;flex:none}
.ok .dot,.dot.ok{background:var(--good)}.bad .dot,.dot.bad{background:var(--bad)}.warn .dot,.dot.warn,.wait .dot,.dot.wait{background:var(--warn)}
.sync.bad{color:var(--bad)}
.link{background:none;border:0;color:var(--accent);text-decoration:underline;padding:0}
.clock{margin:8px 0;padding:8px 10px;border-radius:8px;background:var(--panel2);font-size:12.5px}
.clock b{color:var(--ink)}
.clock.me{background:var(--accent);color:#1a0d06;font-weight:800;letter-spacing:.02em}.clock.me b{color:#1a0d06}
.clock.done{background:#14302a;color:var(--good)}
.pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:#1a0d06;margin-right:6px;animation:p 1s infinite alternate}
@keyframes p{from{opacity:1}to{opacity:.2}}
nav{display:flex;gap:2px}
nav button{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--muted);padding:8px 2px;font-weight:600;font-size:12.5px}
nav button.on{color:var(--ink);border-bottom-color:var(--accent)}
.body{flex:1;overflow-y:auto;padding:10px 12px 40px}
.top{display:flex;gap:10px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
.top.hot{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.top-l{flex:1;min-width:0}
.kicker{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-weight:700}
.top-name{font-size:19px;font-weight:800;margin:2px 0}
.pnote{margin-top:6px;color:#c9ced8;font-size:12.5px}
.notes{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12px}
.notes li::before{content:"• ";color:var(--muted)}
.n-gone{color:var(--warn)}.n-wait{color:var(--good)}.n-tier{color:var(--accent)}.n-need{color:var(--mine)}.n-warn,.n-status{color:var(--bad)}.n-dr{color:#c59bff}.n-inj{color:#ff9f8f}
.act{background:var(--accent);color:#1a0d06;border:0;border-radius:8px;padding:8px 12px;font-weight:800}
.sec{margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
.list{list-style:none;margin:0;padding:0}
.prow{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--line)}
.prow .rk{width:26px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px;flex:none}
.prow .who{flex:1;min-width:0}
.nm{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{color:var(--muted);font-size:11.5px;display:flex;flex-wrap:wrap;gap:2px 8px}
.mini{display:flex;flex-wrap:wrap;gap:2px 8px;font-size:11px;margin-top:1px}
.prow.gone .who,.prow.gone .rk{opacity:.4}.prow.gone .nm{text-decoration:line-through}
.prow.mine{background:var(--mine-soft);border-left:3px solid var(--mine);padding-left:6px}
.prow.mine.gone .who,.prow.mine.gone .rk{opacity:1}.prow.mine.gone .nm{text-decoration:none}
.sm{background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:3px 7px;font-size:11.5px;color:var(--muted);flex:none}
.sm:hover{color:var(--ink);border-color:var(--muted)}.sm.on{color:var(--mine);border-color:var(--mine)}
.b{font-size:9.5px;font-weight:800;letter-spacing:.04em;padding:1px 4px;border-radius:3px;vertical-align:2px;margin-left:2px}
.b-out{background:var(--bad);color:#fff}.b-inj{background:#3a1c1a;color:#ff9f8f}.b-dr{background:#2e2147;color:#c59bff}.b-rk{background:#14302a;color:var(--good)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:12px}.chip i{color:var(--good);font-style:normal;margin-left:3px}
.foot{color:var(--muted);font-size:11px;margin-top:8px}
.empty{color:var(--muted);text-align:center;padding:30px 10px}.empty.small{padding:8px}
.warnbox{background:#352a12;color:var(--warn);border-radius:8px;padding:7px 9px;font-size:12px;margin-bottom:8px}
.search input{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);font:inherit}
.tools{display:flex;justify-content:space-between;align-items:center;margin:8px 0;color:var(--muted);font-size:12px}
.tier{margin-top:10px;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.tier.empty-tier{opacity:.55}
.th{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;padding:7px 10px;background:var(--panel);cursor:pointer}
.tn{font-weight:900;color:var(--accent);font-size:15px}.tl{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.tleft{font-size:11.5px;color:var(--muted)}.tleft.low{color:var(--bad);font-weight:800}
.meter{grid-column:1/-1;height:4px;background:var(--panel2);border-radius:2px;overflow:hidden}.meter i{display:block;height:100%;background:var(--accent)}
.tier .list{padding:0 6px}
.slots{display:flex;flex-wrap:wrap;gap:5px}
.slot{font-size:11.5px;padding:3px 8px;border-radius:999px;border:1px solid var(--line)}
.slot.ok{background:#14302a;color:var(--good);border-color:transparent}.slot.open{border:1px dashed var(--warn);color:var(--warn)}.slot.flex{color:var(--muted)}
.poscount{display:flex;gap:10px;margin-top:8px;color:var(--muted);font-size:12px}.poscount b{color:var(--ink)}
.setup{display:flex;flex-direction:column;gap:7px;font-size:12.5px}
.setup label{display:flex;justify-content:space-between;align-items:center;gap:8px}
.setup input[type=number]{width:70px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:4px 6px;font:inherit}
.btnrow{display:flex;gap:6px}
.ghostbtn{background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:5px 9px;font-size:12px}
.ghostbtn.danger{color:var(--bad)}
.muted{color:var(--muted)}
`;

  Object.assign(HDA, { createApp, storage, defaultSettings });
})(typeof globalThis !== 'undefined' ? globalThis : this);
