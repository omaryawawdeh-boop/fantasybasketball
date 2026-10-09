/*
 * Parse a user's tier list / rankings from pasted text or CSV.
 *
 * Accepted text formats (mix freely):
 *   Tier 1                        <- tier heading ("Tier 2: Elite bigs", "## Tier 3", "=== TIER 4 ===")
 *   1. Nikola Jokic (DEN - C)     <- numbering, bullets, parentheticals are fine
 *   Shai Gilgeous-Alexander, OKC, PG
 *   Victor Wembanyama | SAS | C
 * Without any "Tier" headings, blank lines separate tiers.
 *
 * CSV: header row with a name/player column; optional rank, tier, pos, team, adp.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  const TEAMS = {
    ATL: 'ATL', BOS: 'BOS', BKN: 'BKN', BRK: 'BKN', CHA: 'CHA', CHO: 'CHA', CHI: 'CHI', CLE: 'CLE',
    DAL: 'DAL', DEN: 'DEN', DET: 'DET', GSW: 'GSW', GS: 'GSW', HOU: 'HOU', IND: 'IND', LAC: 'LAC',
    LAL: 'LAL', MEM: 'MEM', MIA: 'MIA', MIL: 'MIL', MIN: 'MIN', NOP: 'NOP', NO: 'NOP', NYK: 'NYK',
    NY: 'NYK', OKC: 'OKC', ORL: 'ORL', PHI: 'PHI', PHX: 'PHX', PHO: 'PHX', POR: 'POR', SAC: 'SAC',
    SAS: 'SAS', SA: 'SAS', TOR: 'TOR', UTA: 'UTA', UTAH: 'UTA', WAS: 'WAS', WSH: 'WAS', FA: 'FA',
  };
  const POS_RE = /^(PG|SG|SF|PF|C|G|F)(\/(PG|SG|SF|PF|C|G|F))*$/i;

  function expandPositions(posStr) {
    const out = new Set();
    for (const p of String(posStr || '').toUpperCase().split(/[\/,\s]+/)) {
      if (!p) continue;
      if (p === 'G') { out.add('PG'); out.add('SG'); }
      else if (p === 'F') { out.add('SF'); out.add('PF'); }
      else if (['PG', 'SG', 'SF', 'PF', 'C'].includes(p)) out.add(p);
    }
    return [...out];
  }

  const DR_RE = /^(DR|don'?t\s*reach.*)$/i;

  function classifyTokens(tokens, entry) {
    for (const raw of tokens) {
      const t = raw.trim().replace(/[()\[\]]/g, '');
      if (!t) continue;
      const up = t.toUpperCase();
      if (DR_RE.test(t)) entry.dontReach = true;
      else if (t === '*') entry.injuryProne = true;
      else if (up === 'ROOKIE') entry.rookie = true;
      else if (TEAMS[up] && !entry.team) entry.team = TEAMS[up];
      else if (POS_RE.test(t) && !entry.pos.length) entry.pos = expandPositions(t);
      else if (/^\d+(\.\d+)?$/.test(t) && entry.adp == null) entry.adp = Number(t);
    }
  }

  const TIER_RE = /^\s*(?:[#=*\-\s]*)tier\s*(\d+)?\s*[:.\-–—=]*\s*(.*?)[\s=#*\-]*$/i;

  function parseTextLine(line) {
    let s = line.trim()
      .replace(/^[-*•·>]+\s*/, '')
      .replace(/^\d+\s*[.):\-]\s*/, '')
      .replace(/^\d+\s+(?=[A-Za-z])/, '');
    const entry = { name: '', pos: [], team: null, adp: null, injuryProne: false, dontReach: false, rookie: false };
    const parens = [];
    s = s.replace(/[(\[]([^)\]]*)[)\]]/g, (_, inner) => { parens.push(inner); return ' '; }).trim();
    const parts = s.split(/\s*[,|\t]\s*|\s+[-–—]\s+/).filter(Boolean);
    entry.name = (parts.shift() || '').trim();
    // "Nikola Jokic DEN C" -> peel trailing team/pos tokens off the name.
    const words = entry.name.split(/\s+/);
    while (words.length > 2) {
      const last = words[words.length - 1];
      if (TEAMS[last.toUpperCase()] && last === last.toUpperCase() || POS_RE.test(last) && last === last.toUpperCase()) {
        parts.unshift(words.pop());
      } else break;
    }
    entry.name = words.join(' ');
    // "Luka Doncic*" = injury prone (spreadsheet convention).
    if (/\*+$/.test(entry.name)) { entry.injuryProne = true; entry.name = entry.name.replace(/\s*\*+$/, ''); }
    classifyTokens(parts, entry);
    for (const p of parens) classifyTokens(p.split(/[\s,\-|–—]+/), entry);
    return entry;
  }

  function splitCsvLine(line, delim) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  function tryParseCsv(lines) {
    const header = lines[0];
    const delim = header.includes('\t') ? '\t' : ',';
    const cols = splitCsvLine(header, delim).map((c) => c.toLowerCase());
    const find = (...names) => cols.findIndex((c) => names.includes(c));
    const iName = find('name', 'player', 'player name', 'player_name', 'playername');
    if (iName < 0) return null;
    const iRank = find('rank', 'rk', 'ecr', 'my rank', 'overall');
    const iTier = find('tier', 'tiers');
    const iPos = find('pos', 'position', 'positions');
    const iTeam = find('team', 'tm', 'nba team');
    const iAdp = find('adp', 'avg pick', 'average draft position');
    const iFlags = find('flags', 'flag', 'tags', 'dr');
    const iNote = find('note', 'notes', 'comment', 'comments');
    const rows = [];
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const c = splitCsvLine(line, delim);
      const entry = parseTextLine(c[iName] || '');
      if (!entry.name) continue;
      if (iPos >= 0 && c[iPos]) entry.pos = expandPositions(c[iPos]);
      if (iTeam >= 0 && c[iTeam] && TEAMS[c[iTeam].toUpperCase()]) entry.team = TEAMS[c[iTeam].toUpperCase()];
      if (iAdp >= 0 && c[iAdp] !== '' && !isNaN(Number(c[iAdp]))) entry.adp = Number(c[iAdp]);
      if (iFlags >= 0 && c[iFlags]) classifyTokens(c[iFlags].split(/[\s,;]+/), entry);
      if (iNote >= 0 && c[iNote]) entry.note = c[iNote];
      entry._rank = iRank >= 0 && c[iRank] !== '' && !isNaN(Number(c[iRank])) ? Number(c[iRank]) : null;
      entry.tier = iTier >= 0 && c[iTier] !== '' && !isNaN(parseInt(c[iTier], 10)) ? parseInt(c[iTier], 10) : null;
      rows.push(entry);
    }
    if (rows.some((r) => r._rank != null)) {
      rows.forEach((r, i) => { r._order = i; });
      rows.sort((a, b) => (a._rank ?? Infinity) - (b._rank ?? Infinity) || a._order - b._order);
    }
    return rows;
  }

  /**
   * @returns {{players: Array<{rank,name,tier,tierLabel,pos,team,adp}>, warnings: string[], format: string}}
   */
  function parseRankings(text) {
    const warnings = [];
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) return { players: [], warnings: ['Nothing to import.'], format: 'empty', tierLabels: {} };

    let rows;
    let format;
    const csv = /[,\t]/.test(lines[0]) ? tryParseCsv(lines) : null;
    const tierLabels = {};
    if (csv) {
      rows = csv;
      format = 'csv';
    } else {
      format = 'text';
      rows = [];
      const hasHeadings = lines.some((l) => TIER_RE.test(l) && !/,/.test(l));
      let tier = hasHeadings ? 0 : 1;
      let sawPlayerInGroup = false;
      for (const line of lines) {
        if (!line.trim()) {
          if (!hasHeadings && sawPlayerInGroup) { tier++; sawPlayerInGroup = false; }
          continue;
        }
        const m = !/,/.test(line) && line.match(TIER_RE);
        if (m) {
          tier = m[1] ? parseInt(m[1], 10) : tier + 1;
          if (m[2]) tierLabels[tier] = m[2].trim();
          continue;
        }
        if (/^[\s=#*\-_]+$/.test(line)) continue;
        const entry = parseTextLine(line);
        if (!entry.name || entry.name.length < 3) continue;
        if (tier === 0) tier = 1;
        entry.tier = tier;
        rows.push(entry);
        sawPlayerInGroup = true;
      }
      if (!hasHeadings && tier === 1) warnings.push('No tiers found — everyone is in Tier 1. Add "Tier 2" lines or blank lines between tiers.');
    }

    const seen = new Set();
    const players = [];
    let lastTier = 1;
    for (const r of rows) {
      const norm = HDA.normalizeName(r.name);
      if (!norm) continue;
      if (seen.has(norm)) { warnings.push(`Duplicate skipped: ${r.name}`); continue; }
      seen.add(norm);
      const tier = r.tier != null ? r.tier : lastTier;
      lastTier = tier;
      const out = { rank: players.length + 1, name: r.name, tier, pos: r.pos, team: r.team, adp: r.adp };
      if (r.injuryProne) out.injuryProne = true;
      if (r.dontReach) out.dontReach = true;
      if (r.rookie) out.rookie = true;
      if (r.note) out.note = r.note;
      players.push(out);
    }
    if (csv && !csv.some((r) => r.tier != null)) warnings.push('CSV has no "tier" column — everyone is in Tier 1.');
    return { players, warnings, format, tierLabels };
  }

  /** Serialize back to the text format (used for "export" and the editor). */
  function rankingsToText(players, tierLabels) {
    const out = [];
    let tier = null;
    for (const p of players) {
      if (p.tier !== tier) {
        tier = p.tier;
        if (out.length) out.push('');
        out.push(`Tier ${tier}${tierLabels && tierLabels[tier] ? ': ' + tierLabels[tier] : ''}`);
      }
      const meta = [p.team, (p.pos || []).join('/')].filter(Boolean).join(' - ');
      let line = (p.injuryProne ? p.name + '*' : p.name) + (meta ? ` (${meta})` : '');
      if (p.dontReach) line += ' | DR';
      out.push(line);
    }
    return out.join('\n');
  }

  Object.assign(HDA, { parseRankings, rankingsToText, expandPositions, NBA_TEAMS: TEAMS });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
