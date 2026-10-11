#!/usr/bin/env python3
"""Rebuild the built-in draft board from Omar's ranking spreadsheet.

    python3 scripts/build_rankings.py "Copy of Fantasy Basketball Ranking 9.xlsx" "Ranking 9"

Column A = player in draft order ("Name*" = injury prone), column B = "DR" flag.
Order comes ONLY from the spreadsheet. Tier breaks are fixed rank ranges from the
tier sheet. Team/position/notes carry over by player from data/omar-rankings.csv;
players new to the list get none (ESPN supplies team/position live).
Writes data/omar-rankings.csv and extension/data/default-rankings.js.
"""
import csv, json, os, re, sys, unicodedata
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, 'data', 'omar-rankings.csv')
JS_PATH = os.path.join(ROOT, 'extension', 'data', 'default-rankings.js')

# Tier sheet breaks (inclusive rank ranges) and names.
TIERS = [(1, 2, 'Franchise'), (3, 6, 'Elite'), (7, 12, 'First round'), (13, 19, 'Round 1 to 2 turn'),
         (20, 30, 'Round 2'), (31, 42, 'Round 3'), (43, 56, 'Round 4'), (57, 71, 'Round 5'),
         (72, 89, 'Rookie and upside zone'), (90, 112, 'Rounds 7 to 8'), (113, 135, 'Late round fliers'),
         (136, 999, 'Deep bench and stashes')]

# Spreadsheet spellings -> the names ESPN uses.
SPELLING = {
    'Micheal Porter Jr.': 'Michael Porter Jr.', 'Stephan Castle': 'Stephon Castle', 'Alexander Sarr': 'Alexandre Sarr',
    'Cam Boozer': 'Cameron Boozer', 'AJ Dybansa': 'AJ Dybantsa', 'Daryn Peterson': 'Darryn Peterson',
    'VJ Edgecomb': 'VJ Edgecombe', 'AJ Mitchell': 'Ajay Mitchell', 'Ayo Donsumu': 'Ayo Dosunmu',
    'Jaime Jaquez': 'Jaime Jaquez Jr.',
}

# Backup birth dates for veterans, used only when ESPN's athlete records can't be
# reached (ESPN's age wins when available). Keep this list to players 32+.
DOB_FALLBACK = {
    'LeBron James': '1984-12-30', 'Stephen Curry': '1988-03-14', 'Kevin Durant': '1988-09-29',
    'James Harden': '1989-08-26', 'DeMar DeRozan': '1989-08-07', 'Damian Lillard': '1990-07-15',
    'Paul George': '1990-05-02', 'Jrue Holiday': '1990-06-12', 'Nikola Vucevic': '1990-10-24',
    'Kawhi Leonard': '1991-06-29', 'CJ McCollum': '1991-09-19', 'Kyrie Irving': '1992-03-23',
    'Rudy Gobert': '1992-06-26', 'Jonas Valanciunas': '1992-05-06', 'T.J. McConnell': '1992-03-25',
    'Tobias Harris': '1992-07-15', 'Andre Drummond': '1993-08-10', 'Clint Capela': '1994-05-18',
}

LEAGUE = {'espnLeagueId': 888634487, 'private': True, 'teams': 14, 'rounds': 13, 'format': 'H2H_POINTS',
          'rosterSlots': {'PG': 1, 'SG': 1, 'SF': 1, 'PF': 1, 'C': 1, 'G': 1, 'F': 1, 'UTIL': 3, 'BE': 3},
          'scoringWeights': {'FGM': 2, 'FTM': 1, '3PM': 1, 'REB': 1, 'AST': 1, 'STL': 3, 'BLK': 3, 'TO': -1, 'DD': 3, 'TD': 5}}


def norm(s):
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    toks = re.sub(r'[^a-z0-9]+', ' ', s.replace('.', '').replace("'", '')).split()
    return ' '.join(t for i, t in enumerate(toks) if not (i > 0 and t in {'jr', 'sr', 'ii', 'iii', 'iv', 'v'}))


def tier_of(rank):
    for i, (a, b, _) in enumerate(TIERS):
        if a <= rank <= b:
            return i + 1
    return len(TIERS)


def main(xlsx, source_label):
    old = {norm(r['player']): r for r in csv.DictReader(open(CSV_PATH, encoding='utf-8'))}
    ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
    out, seen = [], set()
    for row in ws.iter_rows(values_only=True):
        if not row or row[0] is None or not str(row[0]).strip():
            continue
        raw = str(row[0]).strip()
        prone = raw.endswith('*')
        name = raw.rstrip('*').strip()
        name = SPELLING.get(name, name)
        key = norm(name)
        if key in seen:
            print('duplicate skipped:', name, file=sys.stderr)
            continue
        seen.add(key)
        meta = old.get(key, {})
        flags = (meta.get('flags') or '').split()
        rank = len(out) + 1
        out.append({'rank': rank, 'name': name, 'tier': tier_of(rank), 'team': meta.get('team') or None,
                    'pos': [p for p in (meta.get('pos') or '').split('/') if p], 'injuryProne': prone,
                    'dontReach': bool(row[1]) if len(row) > 1 else False, 'rookie': 'ROOKIE' in flags,
                    'note': meta.get('note') or '', 'dob': DOB_FALLBACK.get(name)})
        if not meta:
            print(f'new to the list: #{rank} {name}', file=sys.stderr)

    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['rank', 'player', 'tier', 'team', 'pos', 'flags', 'note'])
        for o in out:
            fl = ' '.join(x for x, c in (('*', o['injuryProne']), ('DR', o['dontReach']), ('ROOKIE', o['rookie'])) if c)
            w.writerow([o['rank'], o['name'], o['tier'], o['team'] or '', '/'.join(o['pos']), fl, o['note']])

    labels = {i + 1: t[2] for i, t in enumerate(TIERS)}
    players = []
    for o in out:
        p = {k: v for k, v in o.items() if v not in (None, '', [], False) or k in ('rank', 'name', 'tier', 'pos')}
        players.append(p)
    js = f'''/*
 * Omar's draft board: GENERATED by scripts/build_rankings.py from "{source_label}".
 * Order is the spreadsheet order, exactly. injuryProne = "*", dontReach = "DR"
 * (market ADP is later, you like him here). Do not edit by hand: re-run the script.
 */
(function (root) {{
  const HDA = (root.HDA = root.HDA || {{}});
  HDA.DEFAULT_RANKINGS_VERSION = {json.dumps(source_label)};
  HDA.DEFAULT_LEAGUE = {json.dumps(LEAGUE)};
  HDA.DEFAULT_TIER_LABELS = {json.dumps(labels)};
  HDA.DEFAULT_RANKINGS = {json.dumps(players, ensure_ascii=False)};
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
}})(typeof globalThis !== 'undefined' ? globalThis : this);
'''
    open(JS_PATH, 'w', encoding='utf-8').write(js)
    print(f'{len(out)} players, {sum(o["dontReach"] for o in out)} DR, {sum(o["injuryProne"] for o in out)} injury prone', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.basename(sys.argv[1]))
