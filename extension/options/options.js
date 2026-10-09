(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { storage } = HDA;

  let settings = { ...HDA.defaultSettings(), ...(await storage.get('hda:settings', {})) };
  let rankings = await storage.get('hda:rankings', null);
  const defaults = () => ({ players: HDA.DEFAULT_RANKINGS, tierLabels: HDA.DEFAULT_TIER_LABELS, source: 'default' });
  if (!rankings || !rankings.players || !rankings.players.length) rankings = defaults();
  let pending = null;

  function renderCurrent() {
    const tiers = new Set(rankings.players.map((p) => p.tier)).size;
    $('current').innerHTML = `
      <span><b>${rankings.players.length}</b> players</span>
      <span><b>${tiers}</b> tiers</span>
      <span><b>${rankings.players.filter((p) => p.dontReach).length}</b> DR</span>
      <span><b>${rankings.players.filter((p) => p.injuryProne).length}</b> injury prone</span>
      <span>Source: <b>${rankings.source === 'default' ? 'your spreadsheet (Ranking 8)' : esc(rankings.sourceName || 'imported list')}</b></span>
      <span>Top 3: ${rankings.players.slice(0, 3).map((p) => esc(p.name)).join(', ')}</span>`;
  }

  function saveSettings() { storage.set('hda:settings', settings); }

  // Re-apply current tier breaks (rank ranges) to a list that has none.
  function carryTiers(players) {
    const byRank = new Map(rankings.players.map((p) => [p.rank, p.tier]));
    const maxTier = Math.max(...rankings.players.map((p) => p.tier || 1));
    for (const p of players) p.tier = byRank.get(p.rank) || maxTier;
    return players;
  }

  function preview() {
    const text = $('paste').value;
    const res = HDA.parseRankings(text);
    const hasTiers = new Set(res.players.map((p) => p.tier)).size > 1;
    let warnings = res.warnings.slice();
    let tierLabels = res.tierLabels || {};
    if (!hasTiers && $('keepTiers').checked && res.players.length) {
      carryTiers(res.players);
      tierLabels = rankings.tierLabels || {};
      warnings = warnings.filter((w) => !/No tiers found|no "tier" column/.test(w));
      warnings.push('No tiers in the pasted list, so your current tier breaks were applied by rank position.');
    }
    pending = res.players.length ? { players: res.players, tierLabels, source: 'import', sourceName: 'pasted list', importedAt: Date.now() } : null;
    $('save').disabled = !pending;
    $('warnings').innerHTML = warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('');
    if (!pending) { $('previewOut').innerHTML = ''; return; }
    let html = `<div class="ok">${res.players.length} players parsed (${res.format}). Check the order below, then Save.</div><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th>Note</th></tr></thead><tbody>`;
    let tier = null;
    for (const p of res.players) {
      if (p.tier !== tier) { tier = p.tier; html += `<tr class="tierrow"><td colspan="5">Tier ${tier}${tierLabels[tier] ? ' · ' + esc(tierLabels[tier]) : ''}</td></tr>`; }
      html += `<tr><td>${p.rank}</td><td>${esc(p.name)}${p.injuryProne ? '<span class="tag inj">*</span>' : ''}${p.dontReach ? '<span class="tag dr">DR</span>' : ''}</td><td>${esc(p.team || '')}</td><td>${esc((p.pos || []).join('/'))}</td><td>${esc(p.note || '')}</td></tr>`;
    }
    $('previewOut').innerHTML = html + '</tbody></table>';
  }

  $('preview').onclick = preview;
  $('save').onclick = async () => {
    if (!pending) return;
    rankings = pending;
    await storage.set('hda:rankings', rankings);
    pending = null;
    $('save').disabled = true;
    $('warnings').innerHTML = '<div class="ok">Saved. Open draft rooms update immediately.</div>';
    renderCurrent();
  };
  $('file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { $('warnings').innerHTML = '<div class="warn">Excel files can’t be read directly. In Excel use File → Save As → CSV, or copy the columns and paste them above.</div>'; return; }
    $('paste').value = await f.text();
    $('importBox').open = true;
    preview();
  };
  $('resetDefault').onclick = async () => {
    if (!confirm('Replace your current board with your spreadsheet board (Ranking 8)?')) return;
    rankings = defaults();
    await storage.set('hda:rankings', null);
    await storage.set('hda:rankings', rankings);
    renderCurrent();
  };
  $('export').onclick = () => {
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v == null ? '' : v));
    const lines = ['rank,player,tier,team,pos,flags,note'];
    for (const p of rankings.players) {
      const flags = [p.injuryProne && '*', p.dontReach && 'DR', p.rookie && 'ROOKIE'].filter(Boolean).join(' ');
      lines.push([p.rank, p.name, p.tier, p.team || '', (p.pos || []).join('/'), flags, p.note || ''].map(q).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'my-draft-board.csv';
    a.click();
  };
  $('copyText').onclick = async () => {
    await navigator.clipboard.writeText(HDA.rankingsToText(rankings.players, rankings.tierLabels));
    $('copyText').textContent = 'Copied!';
    setTimeout(() => { $('copyText').textContent = 'Copy as text'; }, 1500);
  };

  // ----- scoring -----
  const STAT_KEYS = ['PTS', 'FGM', 'FGA', 'FTM', 'FTA', '3PM', '3PA', 'REB', 'OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'DD', 'TD'];
  function renderWeights() {
    $('weights').innerHTML = STAT_KEYS.map((k) => `<label>${k} <input type="number" step="0.5" data-w="${k}" value="${settings.scoringWeights[k] ?? 0}"></label>`).join('');
  }
  $('preset').innerHTML = '<option value="">Custom</option>' + Object.entries(HDA.SCORING_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
  const match = Object.entries(HDA.SCORING_PRESETS).find(([, p]) => JSON.stringify(p.weights) === JSON.stringify(settings.scoringWeights));
  $('preset').value = match ? match[0] : '';
  $('preset').onchange = () => {
    const p = HDA.SCORING_PRESETS[$('preset').value];
    if (!p) return;
    settings.scoringWeights = { ...p.weights };
    renderWeights(); saveSettings();
  };
  $('weights').oninput = (e) => {
    const k = e.target.dataset.w;
    if (!k) return;
    const v = Number(e.target.value);
    if (!v) delete settings.scoringWeights[k]; else settings.scoringWeights[k] = v;
    $('preset').value = '';
    saveSettings();
  };
  $('useLeagueScoring').checked = settings.useLeagueScoring;
  $('useLeagueScoring').onchange = (e) => { settings.useLeagueScoring = e.target.checked; saveSettings(); };

  // ----- draft defaults -----
  for (const k of ['teams', 'rounds', 'mySlot']) {
    $(k).value = settings[k];
    $(k).oninput = (e) => { const v = Number(e.target.value); if (v > 0) { settings[k] = v; saveSettings(); } };
  }
  $('side').value = settings.side;
  $('side').onchange = (e) => { settings.side = e.target.value; saveSettings(); };
  const SLOT_KEYS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL', 'BE', 'IR'];
  $('slots').innerHTML = SLOT_KEYS.map((k) => `<label>${k} <input type="number" min="0" max="10" data-slot="${k}" value="${settings.rosterSlots[k] || 0}"></label>`).join('');
  $('slots').oninput = (e) => {
    const k = e.target.dataset.slot;
    if (!k) return;
    const v = Math.max(0, Number(e.target.value) || 0);
    if (v) settings.rosterSlots[k] = v; else delete settings.rosterSlots[k];
    saveSettings();
  };

  // ----- ESPN league -----
  $('leagueId').value = settings.leagueId || '';
  $('seasonId').value = HDA.defaultSeasonId();
  $('leagueId').oninput = (e) => { settings.leagueId = Number(e.target.value) || null; saveSettings(); };
  const ord = (n) => n + (['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th');

  async function testLeague() {
    const id = Number($('leagueId').value);
    const season = Number($('seasonId').value) || HDA.defaultSeasonId();
    const out = $('leagueOut');
    if (!id) { out.innerHTML = '<div class="warn">Enter your league ID (the number after leagueId= in your ESPN league URL).</div>'; return; }
    out.innerHTML = '<div class="help">Reading league from ESPN…</div>';
    let L;
    try {
      L = HDA.parseLeague(await HDA.directFetchJson(HDA.draftUrls(season, id).league));
    } catch (e) {
      out.innerHTML = `<div class="warn">${e.status === 401 || e.status === 403
        ? 'ESPN said no. For a private league, log in at fantasy.espn.com in this browser, then test again.'
        : e.status === 404 ? `League ${id} not found for the ${season - 1}-${String(season).slice(2)} season. Check the ID and season.`
          : `Couldn’t reach ESPN: ${esc(e.message)}`}</div>`;
      return;
    }
    const teamName = (tid) => { const t = L.teams.find((x) => x.id === tid); return t ? t.name : `Team ${tid}`; };
    const mine = (settings.myTeamIds || {})[id];
    const mySlot = mine != null && L.pickOrder.length ? L.pickOrder.indexOf(mine) + 1 : 0;
    if (mySlot > 0 && settings.mySlot !== mySlot) { settings.mySlot = mySlot; saveSettings(); $('mySlot').value = mySlot; }

    // Compare ESPN's scoring with the scoring on the tier sheet.
    const expected = HDA.weightsToItems(HDA.DEFAULT_LEAGUE.scoringWeights);
    const fmtItems = (items) => items.map((i) => `${HDA.STAT_LABEL[i.statId] || 'stat ' + i.statId} ${i.points > 0 ? '+' : ''}${i.points}`).join(', ');
    const key = (items) => items.map((i) => `${i.statId}:${i.points}`).sort().join('|');
    const scoringMatch = key(L.scoringItems) === key(expected);

    let html = `<div class="ok">Connected: <b>${esc(L.name || 'League ' + id)}</b> · ${L.size} teams · ${L.rounds || '?'} rounds · ${esc((L.draftType || '').toLowerCase())} draft · ${esc((L.scoringType || '').replace(/_/g, ' ').toLowerCase())}</div>`;
    html += `<p class="help">Draft: ${L.draft.complete ? 'complete' : L.draft.inProgress ? '<b>in progress now</b>' : L.draftDate ? new Date(L.draftDate).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'date not set'}</p>`;
    html += `<p class="help">ESPN scoring: ${esc(fmtItems(L.scoringItems)) || 'none listed'}${scoringMatch ? ' — matches your tier sheet.' : '<br><b>Differs from your tier sheet’s scoring.</b> The panel uses ESPN’s numbers (FP/G will follow ESPN).'}</p>`;
    html += `<div class="row"><label>Which team is yours? <select id="myTeam"><option value="">— pick your team —</option>${L.teams.map((t) => `<option value="${t.id}" ${t.id === mine ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>`;
    if (L.pickOrder.length) {
      html += mySlot > 0 ? `<div class="ok">You pick <b>${ord(mySlot)}</b>. Your picks: ${HDA.pickNumbersForSlot(mySlot, L.size, L.rounds || 13).join(', ')}.</div>` : '';
      html += `<table><thead><tr><th>Slot</th><th>Team</th></tr></thead><tbody>${L.pickOrder.map((tid, i) => `<tr${tid === mine ? ' style="color:var(--accent);font-weight:700"' : ''}><td>${i + 1}</td><td>${esc(teamName(tid))}</td></tr>`).join('')}</tbody></table>`;
    } else {
      html += '<div class="warn">ESPN hasn’t set the draft order yet. Test again once it’s randomized; your pick will show here. In the draft room it’s detected automatically either way.</div>';
    }
    out.innerHTML = html;
    $('myTeam').onchange = (e) => {
      settings.myTeamIds = { ...(settings.myTeamIds || {}), [id]: Number(e.target.value) || undefined };
      saveSettings();
      testLeague();
    };
  }
  $('testLeague').onclick = testLeague;

  renderCurrent();
  renderWeights();
})();
