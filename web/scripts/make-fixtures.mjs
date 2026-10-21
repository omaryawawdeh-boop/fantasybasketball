// Generates the DEMO fixtures in src/server/fixtures/data.ts.
//
// Demo data exists so the app is explorable offline and so tests can exercise the real parsers.
// Every player in it is FICTIONAL (invented names, ids 9001+); teams are real only so linking and
// colors work. Headlines start with "Demo —". Timestamps are placeholders resolved relative to
// "now" when read, e.g. {{t:-90}} = 90 minutes ago, {{g:-1:1930}} = yesterday 7:30 PM ET.
//
// Run: node scripts/make-fixtures.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "server", "fixtures", "data.ts");

let seed = 20261021;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const TEAMS = [
  { id: "18", abbr: "NY", name: "New York Knicks" },
  { id: "2", abbr: "BOS", name: "Boston Celtics" },
  { id: "13", abbr: "LAL", name: "Los Angeles Lakers" },
  { id: "7", abbr: "DEN", name: "Denver Nuggets" },
  { id: "25", abbr: "OKC", name: "Oklahoma City Thunder" },
  { id: "14", abbr: "MIA", name: "Miami Heat" },
];

// Fictional names. Archetype drives per-game stat generation.
const NAMES = {
  18: [["Darius Vantrell", "PG", "star"], ["Mason Okafor-Reyes", "SF", "starter"], ["Theo Lindqvist", "C", "big"], ["Jalen Brightwater", "SG", "starter"], ["Corey Ashdown", "PF", "starter"], ["Eli Marchetti", "G", "bench"], ["Quinn Halvorsen", "F", "bench"]],
  2: [["Rowan Castellane", "SF", "star"], ["Isaiah Penhallow", "PG", "starter"], ["Dmitri Albescu", "C", "big"], ["Marcus Wexford", "SG", "starter"], ["Tobias Ferreira", "PF", "starter"], ["Kendall Strome", "G", "bench"], ["Abel Nakamura", "F", "bench"]],
  13: [["Andre Solenne", "PG", "star"], ["Victor Hallbrook", "PF", "star"], ["Silas Okonjo", "C", "big"], ["Grant Delacroix", "SG", "starter"], ["Reggie Fairmont", "SF", "starter"], ["Nate Bellamy", "G", "bench"], ["Owen Tsukada", "C", "bench"]],
  7: [["Luka Varga-Moss", "C", "star"], ["Jamal Ridgeway", "PG", "starter"], ["Callum Ostrander", "SF", "starter"], ["Paxton Greer", "SG", "starter"], ["Bram Kowalczyk", "PF", "starter"], ["Desmond Ilori", "G", "bench"], ["Felix Ambrose", "F", "bench"]],
  25: [["Shay Adeyemi-Grant", "PG", "star"], ["Kofi Mensah-Hart", "SF", "starter"], ["Ivo Petrakis", "C", "big"], ["Lucas Thornbury", "SG", "starter"], ["Damon Achterberg", "PF", "starter"], ["Ray Okwuosa", "G", "bench"], ["Hugo Sandström", "F", "bench"]],
  14: [["Tyrese Kallenbach", "SG", "star"], ["Bam Oyelaran", "C", "big"], ["Nico Arrowsmith", "SF", "starter"], ["Jordan Pellegrini", "PG", "starter"], ["Kyle Dunleavy-Ross", "PF", "starter"], ["Haywood Price", "G", "bench"], ["Milo Varnado", "F", "bench"]],
};

let nextId = 9001;
const PLAYERS = [];
for (const t of TEAMS) {
  NAMES[t.id].forEach(([name, pos, arch], i) => {
    PLAYERS.push({ id: String(nextId++), name, pos, arch, teamId: t.id, jersey: String(ri(0, 35)), starter: i < 5, age: ri(21, 34), exp: ri(1, 12), height: `6' ${ri(2, 11)}"`, weight: `${ri(185, 255)} lbs` });
  });
}
const idOf = (n) => PLAYERS.find((p) => p.name === n).id;
const STAR_OUT = PLAYERS.find((p) => p.name === "Darius Vantrell"); // the injury storyline

function line(p) {
  const base = { star: [34, 26, 6, 6], starter: [30, 14, 5, 3], big: [29, 13, 10, 2], bench: [17, 7, 3, 2] }[p.arch];
  const min = Math.max(8, base[0] + ri(-5, 4));
  const fga = Math.max(2, Math.round(base[1] / 1.9 + ri(-3, 3)));
  const fgm = Math.round(fga * (0.4 + rnd() * 0.18));
  const tpa = Math.max(0, Math.round(fga * (p.arch === "big" ? 0.1 : 0.38)));
  const tpm = Math.min(tpa, Math.round(tpa * (0.28 + rnd() * 0.15)));
  const fta = ri(0, p.arch === "star" ? 9 : 4);
  const ftm = Math.round(fta * (0.7 + rnd() * 0.2));
  const pts = 2 * fgm + tpm + ftm;
  const oreb = ri(0, p.arch === "big" ? 4 : 1);
  const reb = oreb + Math.max(0, base[2] + ri(-3, 3));
  return { min, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb: reb - oreb, reb, ast: Math.max(0, base[3] + ri(-2, 3)), stl: ri(0, 3), blk: ri(0, p.arch === "big" ? 3 : 1), tov: ri(0, 4), pf: ri(0, 5), pm: ri(-15, 15), pts };
}

// ---- League demo schedule: day offsets -14 .. +10 ----
const pairs = [
  ["18", "2"], ["13", "7"], ["14", "25"], ["2", "13"], ["7", "18"], ["25", "13"], ["18", "14"], ["2", "7"], ["25", "18"], ["14", "13"], ["7", "25"], ["2", "14"],
];
const GAMES = [];
let gid = 401900001;
for (let d = -14; d <= 10; d++) {
  const n = d === 0 ? 3 : d % 3 === 0 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const [h, a] = pairs[(d + 14 + k * 5) % pairs.length];
    const g = { id: String(gid++), day: d, home: h, away: a, time: k === 0 ? "1930" : k === 1 ? "2000" : "2230" };
    if (d < 0) g.state = "post";
    else if (d > 0) g.state = "pre";
    else g.state = k === 0 ? "in" : "pre";
    GAMES.push(g);
  }
}
// Today: game 0 is live (started 90 minutes ago), the others start in 2h and 4h.
const today = GAMES.filter((g) => g.day === 0);
today[0].when = "{{t:-90}}";
today[1].when = "{{t:120}}";
today[2].when = "{{t:240}}";
for (const g of GAMES) if (!g.when) g.when = `{{g:${g.day}:${g.time}}}`;

const LABELS = ["MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TO", "PF", "+/-", "PTS"];
const box = new Map(); // gameId -> { [teamId]: [{p, l}] }
for (const g of GAMES) {
  if (g.state === "pre") continue;
  const b = {};
  for (const tid of [g.home, g.away]) {
    b[tid] = PLAYERS.filter((p) => p.teamId === tid).map((p) => {
      // The injury storyline: Vantrell sat out the last two games.
      if (p === STAR_OUT && g.day >= -2) return { p, l: null };
      const l = line(p);
      if (g.state === "in") for (const k of Object.keys(l)) if (typeof l[k] === "number" && k !== "pm") l[k] = Math.round(l[k] * 0.65);
      return { p, l };
    });
  }
  box.set(g.id, b);
}
const teamScore = (g, tid) => box.get(g.id)?.[tid].reduce((s, x) => s + (x.l?.pts ?? 0), 0) ?? 0;

// Each team's record going into/after a game, from the demo schedule itself (consistent everywhere).
function recordOf(g, tid) {
  let w = 0, l = 0;
  for (const x of GAMES) {
    if (x.state !== "post" || (x.home !== tid && x.away !== tid)) continue;
    if (x.day > g.day || (x.day === g.day && Number(x.id) > Number(g.id))) continue;
    const other = x.home === tid ? x.away : x.home;
    if (teamScore(x, tid) > teamScore(x, other)) w++; else l++;
  }
  return `${w}-${l}`;
}

function competitor(g, tid, homeAway) {
  const t = TEAMS.find((x) => x.id === tid);
  const score = g.state === "pre" ? "0" : String(teamScore(g, tid));
  const other = homeAway === "home" ? g.away : g.home;
  const q = g.state === "pre" ? [] : splitQuarters(Number(score), g.state === "in" ? 3 : 4);
  return {
    id: tid,
    homeAway,
    winner: g.state === "post" ? teamScore(g, tid) > teamScore(g, other) : false,
    team: { id: tid, abbreviation: t.abbr, displayName: t.name },
    score,
    records: [{ summary: recordOf(g, tid) }],
    linescores: q.map((v) => ({ value: v })),
  };
}
function splitQuarters(total, n) {
  const out = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.round(total / n + ri(-4, 4));
    out.push(v);
    left -= v;
  }
  return out;
}
function status(g) {
  if (g.state === "post") return { type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } };
  if (g.state === "in") return { period: 3, displayClock: "5:12", type: { name: "STATUS_IN_PROGRESS", state: "in", completed: false, shortDetail: "5:12 - 3rd" } };
  return { type: { name: "STATUS_SCHEDULED", state: "pre", completed: false, shortDetail: "Scheduled" } };
}
function event(g) {
  return {
    id: g.id,
    date: g.when,
    name: "demo",
    status: status(g),
    competitions: [{ id: g.id, date: g.when, status: status(g), venue: { fullName: "Demo Arena" }, broadcasts: [{ names: ["Demo TV"] }], competitors: [competitor(g, g.home, "home"), competitor(g, g.away, "away")] }],
  };
}

const F = {};
for (let d = -2; d <= 2; d++) F[`espn-scoreboard-d${d}`] = { events: GAMES.filter((g) => g.day === d).map(event) };

for (const g of GAMES) {
  if (g.day < -3 || g.day > 3) continue;
  const b = box.get(g.id) ?? {};
  const comp = event(g).competitions[0];
  F[`espn-summary-${g.id}`] = {
    header: { id: g.id, competitions: [comp] },
    gameInfo: { venue: { fullName: "Demo Arena" } },
    boxscore: {
      // Before tip-off ESPN's summary has the header but no player box score.
      players: (g.state === "pre" ? [] : [g.away, g.home]).map((tid) => {
        const t = TEAMS.find((x) => x.id === tid);
        return {
          team: { id: tid, abbreviation: t.abbr, displayName: t.name },
          statistics: [
            {
              labels: LABELS,
              athletes: b[tid].map(({ p, l }) => ({
                athlete: { id: p.id, displayName: p.name, position: { abbreviation: p.pos } },
                starter: p === STAR_OUT ? false : p.starter,
                didNotPlay: !l,
                reason: l ? undefined : "DNP - Left ankle sprain",
                stats: l ? [l.min, `${l.fgm}-${l.fga}`, `${l.tpm}-${l.tpa}`, `${l.ftm}-${l.fta}`, l.oreb, l.dreb, l.reb, l.ast, l.stl, l.blk, l.tov, l.pf, l.pm > 0 ? `+${l.pm}` : String(l.pm), l.pts].map(String) : [],
              })),
              totals: [],
            },
          ],
        };
      }),
    },
  };
}

for (const t of TEAMS) {
  F[`espn-roster-${t.id}`] = {
    athletes: PLAYERS.filter((p) => p.teamId === t.id).map((p) => ({
      id: p.id,
      displayName: p.name,
      jersey: p.jersey,
      position: { abbreviation: p.pos },
      displayHeight: p.height,
      displayWeight: p.weight,
      age: p.age,
      experience: { years: p.exp },
      college: { name: "Demo University" },
      injuries: p === STAR_OUT ? [{ status: "Out" }] : [],
    })),
  };
  F[`espn-schedule-${t.id}`] = { events: GAMES.filter((g) => g.home === t.id || g.away === t.id).map(event) };
}

for (const p of PLAYERS) {
  const t = TEAMS.find((x) => x.id === p.teamId);
  F[`espn-athlete-${p.id}`] = {
    athlete: {
      id: p.id,
      displayName: p.name,
      team: { id: t.id, abbreviation: t.abbr, displayName: t.name },
      position: { abbreviation: p.pos },
      jersey: p.jersey,
      displayHeight: p.height,
      displayWeight: p.weight,
      age: p.age,
      displayDOB: "1/1/2000",
      experience: { years: p.exp },
      college: { name: "Demo University" },
      injuries: p === STAR_OUT ? [{ status: "Out" }] : [],
    },
  };
  const games = GAMES.filter((g) => g.state === "post" && (g.home === p.teamId || g.away === p.teamId));
  const events = {};
  const rows = [];
  for (const g of games) {
    const l = box.get(g.id)[p.teamId].find((x) => x.p === p).l;
    if (!l) continue;
    const opp = TEAMS.find((x) => x.id === (g.home === p.teamId ? g.away : g.home));
    const us = teamScore(g, p.teamId);
    const them = teamScore(g, opp.id);
    events[g.id] = { id: g.id, gameDate: g.when, atVs: g.home === p.teamId ? "vs" : "@", opponent: { id: opp.id, abbreviation: opp.abbr }, gameResult: us > them ? "W" : "L", score: `${us}-${them}` };
    rows.push({ eventId: g.id, stats: [l.min, `${l.fgm}-${l.fga}`, "", `${l.tpm}-${l.tpa}`, "", `${l.ftm}-${l.fta}`, "", l.reb, l.ast, l.blk, l.stl, l.pf, l.tov, l.pts].map(String) });
  }
  const glLabels = ["MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"];
  F[`espn-gamelog-${p.id}`] = { labels: glLabels, events, seasonTypes: [{ displayName: "Demo Regular Season", categories: [{ type: "event", events: rows }] }] };
  // Previous season: 40 games spread over last season's calendar (days -400 .. -220).
  const prevEvents = {};
  const prevRows = [];
  for (let i = 0; i < 40; i++) {
    const id = `4018${p.id}${String(i).padStart(2, "0")}`;
    const opp = TEAMS[(i + Number(p.id)) % TEAMS.length];
    if (opp.id === p.teamId) continue;
    const l = line(p);
    prevEvents[id] = { id, gameDate: `{{g:${-400 + i * 4}:1930}}`, atVs: i % 2 ? "@" : "vs", opponent: { id: opp.id, abbreviation: opp.abbr }, gameResult: rnd() > 0.5 ? "W" : "L", score: "" };
    prevRows.push({ eventId: id, stats: [l.min, `${l.fgm}-${l.fga}`, "", `${l.tpm}-${l.tpa}`, "", `${l.ftm}-${l.fta}`, "", l.reb, l.ast, l.blk, l.stl, l.pf, l.tov, l.pts].map(String) });
  }
  F[`espn-gamelog-${p.id}-prev`] = { labels: glLabels, events: prevEvents, seasonTypes: [{ displayName: "Demo Regular Season", categories: [{ type: "event", events: prevRows }] }] };
  const seasons = ["Demo 2022-23", "Demo 2023-24", "Demo 2024-25", "Demo 2025-26"];
  F[`espn-career-${p.id}`] = {
    categories: [
      {
        name: "averages",
        labels: ["GP", "GS", "MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
        statistics: seasons.map((s) => {
          const l = line(p);
          return { season: { displayName: s }, teamId: p.teamId, stats: [ri(50, 80), ri(0, 80), l.min, `${l.fgm}.0-${l.fga}.0`, ((l.fgm / Math.max(1, l.fga)) * 100).toFixed(1), `${l.tpm}.0-${l.tpa}.0`, ((l.tpm / Math.max(1, l.tpa)) * 100).toFixed(1), `${l.ftm}.0-${l.fta}.0`, ((l.ftm / Math.max(1, l.fta)) * 100).toFixed(1), l.oreb, l.dreb, l.reb, l.ast, l.blk, l.stl, l.pf, l.tov, l.pts].map(String) };
        }),
      },
    ],
  };
}

F["espn-injuries"] = {
  injuries: [
    { id: "18", displayName: "New York Knicks", injuries: [{ id: "i1", status: "Out", date: "{{t:-35}}", athlete: { displayName: STAR_OUT.name, links: [{ href: `https://www.espn.com/nba/player/_/id/${STAR_OUT.id}/demo` }] }, type: { description: "Ankle" }, details: { type: "Sprain", location: "Ankle", side: "Left", returnDate: null }, shortComment: "Demo — ruled out for tonight's game with a left ankle sprain." }] },
    { id: "13", displayName: "Los Angeles Lakers", injuries: [{ id: "i2", status: "Day-To-Day", date: "{{t:-300}}", athlete: { id: idOf("Victor Hallbrook"), displayName: "Victor Hallbrook" }, type: { description: "Knee" }, details: { type: "Soreness", location: "Knee", side: "Right" }, shortComment: "Demo — listed as day-to-day with right knee soreness." }] },
    { id: "7", displayName: "Denver Nuggets", injuries: [{ id: "i3", status: "Out", date: "{{t:-1500}}", athlete: { id: idOf("Felix Ambrose"), displayName: "Felix Ambrose" }, type: { description: "Hamstring" }, details: { type: "Strain", location: "Hamstring", side: "Left", returnDate: "{{d:14}}" }, shortComment: "Demo — expected to miss about two weeks." }] },
    { id: "14", displayName: "Miami Heat", injuries: [{ id: "i4", status: "Questionable", date: "{{t:-180}}", athlete: { id: idOf("Tyrese Kallenbach"), displayName: "Tyrese Kallenbach" }, type: { description: "Illness" }, details: { type: "Illness" }, shortComment: "Demo — questionable for tonight with an illness." }] },
  ],
};

const standingsRows = (ids) => {
  const rows = ids.map((id) => {
    const [w, l] = recordOf({ day: 99, id: "0" }, id).split("-").map(Number);
    let pf = 0, pa = 0, n = 0;
    for (const x of GAMES) if (x.state === "post" && (x.home === id || x.away === id)) { const o = x.home === id ? x.away : x.home; pf += teamScore(x, id); pa += teamScore(x, o); n++; }
    return { id, w, l, ppg: n ? pf / n : 0, opp: n ? pa / n : 0 };
  }).sort((a, b) => b.w / Math.max(1, b.w + b.l) - a.w / Math.max(1, a.w + a.l));
  const lead = rows[0];
  return rows.map((r, i) => ({
    team: { id: r.id, abbreviation: TEAMS.find((t) => t.id === r.id).abbr, displayName: TEAMS.find((t) => t.id === r.id).name },
    stats: [
      { name: "wins", value: r.w }, { name: "losses", value: r.l }, { name: "winPercent", value: r.w / Math.max(1, r.w + r.l) },
      { name: "gamesBehind", displayValue: i === 0 ? "-" : String(((lead.w - r.w) + (r.l - lead.l)) / 2) },
      { name: "streak", displayValue: "-" }, { name: "playoffSeed", value: i + 1 },
      { name: "avgPointsFor", value: Math.round(r.ppg * 10) / 10 }, { name: "avgPointsAgainst", value: Math.round(r.opp * 10) / 10 },
    ],
  }));
};
F["espn-standings"] = {
  children: [
    { name: "Eastern Conference", standings: { entries: standingsRows(["18", "2", "14"]) } },
    { name: "Western Conference", standings: { entries: standingsRows(["25", "7", "13"]) } },
  ],
};

const P = (n) => PLAYERS.find((p) => p.name === n);
const art = (id, mins, headline, description, cats = [], type = "HeadlineNews") => ({
  id,
  type,
  headline: `Demo — ${headline}`,
  description,
  published: `{{t:${-mins}}}`,
  lastModified: `{{t:${-mins + 5}}}`,
  premium: false,
  byline: "Demo Desk",
  links: { web: { href: `https://example.com/demo/${id}` } },
  categories: cats,
});
const ath = (n) => ({ type: "athlete", athleteId: P(n).id });
const team = (id) => ({ type: "team", teamId: id });

F["espn-news"] = {
  articles: [
    art("n1", 35, `Knicks rule out ${STAR_OUT.name} (left ankle sprain) vs. Lakers`, `The Knicks announced ${STAR_OUT.name} is out tonight with a left ankle sprain after he was listed as questionable this morning.`, [ath(STAR_OUT.name), team("18")]),
    art("n2", 420, `${STAR_OUT.name} questionable for Knicks with ankle sprain`, `${STAR_OUT.name} is questionable for tonight's game against the Lakers with a left ankle sprain, the team said.`, [ath(STAR_OUT.name), team("18")]),
    art("n3", 95, "Thunder agree to trade for Heat wing Nico Arrowsmith, per sources", "Oklahoma City has agreed to acquire Nico Arrowsmith from Miami for two second-round picks, per league sources. The deal is not yet official.", [ath("Nico Arrowsmith"), team("25"), team("14")]),
    art("n4", 600, "Luka Varga-Moss posts 41-point triple-double, a Nuggets franchise record", "Varga-Moss had 41 points, 14 rebounds and 12 assists in Denver's win over Boston, setting a franchise record for points in a triple-double.", [ath("Luka Varga-Moss"), team("7")]),
    art("n5", 200, "Celtics' Abel Nakamura will start in place of Tobias Ferreira", "Boston will move Abel Nakamura into the starting lineup, coach said Tuesday; Tobias Ferreira moves to the bench.", [ath("Abel Nakamura"), team("2")]),
    art("n6", 1300, "Fantasy basketball waiver wire: three pickups for the week", "Demo fantasy column. Eli Marchetti's minutes are up with Vantrell sidelined; Quinn Halvorsen is a streaming option.", [ath("Eli Marchetti"), team("18")]),
    art("n7", 2800, "Film breakdown: how the Lakers' new pick-and-roll coverage works", "Demo analysis of Los Angeles' defensive scheme through five games.", [team("13")]),
    art("n8", 4000, "On this day: a look back at the Celtics' historic 1986 season", "Demo history piece revisiting Boston's 1985-86 team.", [team("2")]),
    art("n9", 150, "Rowan Castellane after win: 'We're still finding our rhythm'", "Demo postgame press conference quotes from the Celtics forward.", [ath("Rowan Castellane"), team("2")], "Media"),
  ],
};

const rss = (title, items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items
  .map((i) => `<item><title><![CDATA[Demo — ${i.t}]]></title><link>https://example.com/demo/${i.id}</link><description><![CDATA[${i.d}]]></description><pubDate>{{r:${-i.m}}}</pubDate></item>`)
  .join("")}</channel></rss>`;

F["rss-espn-rss"] = rss("ESPN NBA (demo)", [{ id: "n1", t: `Knicks rule out ${STAR_OUT.name} (left ankle sprain) vs. Lakers`, d: "Duplicate of the ESPN API story; merged by URL.", m: 35 }]);
F["rss-cbs"] = rss("CBS (demo)", [
  { id: "c1", t: "Heat trading Nico Arrowsmith to Thunder", d: "Miami is sending Nico Arrowsmith to Oklahoma City for two second-round picks, according to multiple reports.", m: 80 },
  { id: "c2", t: "Nuggets beat Celtics behind Varga-Moss record night", d: "Denver defeated Boston 121-114 as Luka Varga-Moss set a franchise record.", m: 640 },
]);
F["rss-yahoo"] = rss("Yahoo (demo)", [{ id: "y1", t: "Thunder land Nico Arrowsmith in deal with Heat", d: "Oklahoma City agreed to acquire Arrowsmith for two second-round picks, according to sources.", m: 70 }]);
F["rss-nbcsports"] = rss("NBC (demo)", []);
F["rss-hoopshype"] = rss("HoopsHype (demo)", [
  { id: "h1", t: "Lakers could pursue a trade for a backup center", d: "Rumor: the Lakers are reportedly monitoring the market for a backup center, per a report.", m: 260 },
  { id: "h2", t: "Thunder land Arrowsmith from Heat", d: "Oklahoma City is acquiring Nico Arrowsmith from Miami, according to sources (via another outlet).", m: 60 },
]);
F["rss-realgm"] = rss("RealGM (demo)", [{ id: "r1", t: "Knicks sign Quinn Halvorsen to rest-of-season contract", d: "The Knicks announced they have signed forward Quinn Halvorsen.", m: 900 }]);

const yt = (vid, title, mins, desc) => `<entry><id>yt:video:${vid}</id><yt:videoId>${vid}</yt:videoId><title>Demo — ${title}</title><published>{{t:${-mins}}}</published><media:group><media:title>${title}</media:title><media:description>${desc}</media:description></media:group></entry>`;
F["rss-yt-nba"] = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><title>NBA (demo)</title>${[
  yt("demoVid0001", "Luka Varga-Moss 41-point triple-double highlights", 560, "Demo highlight entry. No real video exists."),
  yt("demoVid0002", "Top 10 plays of the night", 300, "Demo highlight entry. No real video exists."),
  yt("demoVid0003", "Rowan Castellane postgame press conference", 140, "Demo press conference entry."),
  yt("demoVid0004", "Shay Adeyemi-Grant game-winner vs. Heat", 1500, "Demo highlight entry."),
].join("")}</feed>`;

const entries = Object.entries(F).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// GENERATED by scripts/make-fixtures.mjs — DEMO DATA. All players are fictional.\n// Do not edit by hand; edit the generator and re-run it.\nexport const FIXTURES: Record<string, string> = ${JSON.stringify(Object.fromEntries(entries), null, 0)};\n\nexport const DEMO_PLAYER_IDS = ${JSON.stringify(PLAYERS.map((p) => p.id))};\n`,
);
console.log(`wrote ${entries.length} fixtures, ${PLAYERS.length} fictional players → ${OUT}`);
