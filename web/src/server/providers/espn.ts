import "server-only";
import type {
  BoxPlayerLine,
  BoxTeam,
  ContentItem,
  Game,
  GameDetail,
  GameLogEntry,
  GameState,
  GameTeam,
  InjuryEntry,
  PlayerBio,
  PlayerStats,
  RosterPlayer,
  ScheduleGame,
  SeasonLine,
  StandingRow,
} from "@/lib/types";
import { teamByAbbr, teamById } from "@/lib/teams";
import { classify, citedOrigin, verify } from "@/lib/classify";
import { safeUrl, stripHtml, truncate } from "@/lib/text";
import { espnSeasonYear, seasonLabelFromEspnYear } from "@/lib/stats";
import { getCached, type Fetched } from "../fetcher";
import { arr, bool, get, isoDate, madeAttempted, mapSafe, num, obj, parseJson, str, type J } from "../parse";

// ESPN's public site API (the JSON behind espn.com). It is undocumented and unofficial:
// no key, no published terms for third-party use, and it can change or disappear without notice.
// We use it for personal, non-commercial reading only, poll it gently (TTL caches below), show
// ESPN as the source, and link back. See README → Data sources for the risk assessment.

const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const CORE_WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

const MIN = 60_000;

// ---------- shared ----------

function teamRef(t: J): { id: string; abbr: string; name: string } | null {
  const id = str(get(t, "id"));
  const def = teamById(id) ?? teamByAbbr(str(get(t, "abbreviation")));
  if (!def && !id) return null;
  return {
    id: def?.id ?? id!,
    abbr: def?.abbr ?? str(get(t, "abbreviation")) ?? "?",
    name: def?.name ?? str(get(t, "displayName")) ?? "Unknown team",
  };
}

function gameState(status: J): GameState {
  const name = (str(get(status, "type", "name")) ?? "").toUpperCase();
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED|DELAYED/.test(name)) return "postponed";
  const s = str(get(status, "type", "state"));
  if (s === "pre" || s === "in" || s === "post") return s;
  return "unknown";
}

function parseCompetitor(c: J, state: GameState): GameTeam | null {
  const t = teamRef(get(c, "team"));
  if (!t) return null;
  const rawScore = get(c, "score");
  const score = state === "pre" ? null : num(obj(rawScore) ? get(rawScore, "value") ?? get(rawScore, "displayValue") : rawScore);
  const records = arr(get(c, "records")).concat(arr(get(c, "record")));
  const record = str(get(records[0], "summary")) ?? str(get(records[0], "displayValue"));
  const linescores = arr(get(c, "linescores"))
    .map((l) => num(get(l, "value")) ?? num(get(l, "displayValue")))
    .filter((v): v is number => v != null);
  return {
    ...t,
    score,
    record,
    linescores,
    homeAway: str(get(c, "homeAway")) === "home" ? "home" : "away",
    winner: state === "post" ? bool(get(c, "winner")) : null,
  };
}

function parseGame(ev: J, comp: J = get(ev, "competitions", 0)): Game | null {
  const id = str(get(ev, "id")) ?? str(get(comp, "id"));
  const date = isoDate(get(ev, "date")) ?? isoDate(get(comp, "date"));
  if (!id || !date) return null;
  const status = get(comp, "status") ?? get(ev, "status");
  const state = gameState(status);
  const teams = arr(get(comp, "competitors")).map((c) => parseCompetitor(c, state)).filter((x): x is GameTeam => !!x);
  const home = teams.find((t) => t.homeAway === "home");
  const away = teams.find((t) => t.homeAway === "away");
  if (!home || !away) return null;
  return {
    id,
    date,
    state,
    statusText: str(get(status, "type", "shortDetail")) ?? str(get(status, "type", "detail")) ?? str(get(status, "type", "description")) ?? "",
    period: state === "in" ? num(get(status, "period")) : null,
    clock: state === "in" ? str(get(status, "displayClock")) : null,
    home,
    away,
    venue: str(get(comp, "venue", "fullName")) ?? str(get(ev, "gameInfo", "venue", "fullName")),
    broadcasts: arr(get(comp, "broadcasts")).flatMap((b) => arr(get(b, "names")).map(str).filter((s): s is string => !!s)),
  };
}

// ---------- scoreboard ----------

export function parseScoreboard(raw: string): Game[] {
  const j = parseJson(raw);
  if (!Array.isArray(get(j, "events"))) throw new Error("missing events[]");
  return mapSafe(arr(get(j, "events")), (ev) => parseGame(ev)).out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** yyyymmdd in US Eastern time — the NBA's scheduling day. */
export function nbaDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts.replace(/-/g, "");
}

function dayOffset(ymd: string): number {
  const today = nbaDay(new Date());
  const toUtc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return Math.round((toUtc(ymd) - toUtc(today)) / 86_400_000);
}

export async function getScoreboard(ymd: string): Promise<Fetched<Game[] | null>> {
  const off = dayOffset(ymd);
  return getCached({
    provider: "espn-scoreboard",
    url: `${SITE}/scoreboard?dates=${ymd}`,
    fixture: off >= -2 && off <= 2 ? `espn-scoreboard-d${off}` : null,
    // Today refreshes fast (games may be live); past days rarely change; future days slowly.
    ttlMs: off === 0 ? 20_000 : off < 0 ? 30 * MIN : 10 * MIN,
    parse: parseScoreboard,
  });
}

// ---------- game summary / box score ----------

export function parseSummary(raw: string): GameDetail {
  const j = parseJson(raw);
  const header = get(j, "header");
  const comp = get(header, "competitions", 0);
  const game = parseGame({ id: get(header, "id"), date: get(comp, "date"), gameInfo: get(j, "gameInfo") }, comp);
  if (!game) throw new Error("missing header.competitions");
  if (!game.venue) game.venue = str(get(j, "gameInfo", "venue", "fullName"));
  let startersConfirmed = false;
  const box: BoxTeam[] = mapSafe(arr(get(j, "boxscore", "players")), (tp) => {
    const team = teamRef(get(tp, "team"));
    const group = get(tp, "statistics", 0);
    if (!team || !group) return null;
    const labels = arr(get(group, "labels")).map((l) => str(l) ?? "");
    const players: BoxPlayerLine[] = mapSafe(arr(get(group, "athletes")), (a) => {
      const id = str(get(a, "athlete", "id"));
      const name = str(get(a, "athlete", "displayName"));
      if (!id || !name) return null;
      const starter = bool(get(a, "starter")) ?? false;
      if (starter) startersConfirmed = true;
      const statsArr = arr(get(a, "stats"));
      const stats: Record<string, string> = {};
      labels.forEach((l, i) => {
        const v = str(statsArr[i]);
        if (l && v != null) stats[l] = v;
      });
      return {
        playerId: id,
        name,
        position: str(get(a, "athlete", "position", "abbreviation")),
        starter,
        didNotPlay: bool(get(a, "didNotPlay")) ?? statsArr.length === 0,
        dnpReason: str(get(a, "reason")),
        stats,
      };
    }).out;
    const totalsArr = arr(get(group, "totals"));
    const totals: Record<string, string> = {};
    labels.forEach((l, i) => {
      const v = str(totalsArr[i]);
      if (l && v != null) totals[l] = v;
    });
    return { team, labels, players, totals };
  }).out;
  // Starters are only "confirmed" once the game has started and the box score marks them.
  return { game, box, startersConfirmed: startersConfirmed && game.state !== "pre" };
}

export async function getGame(id: string) {
  return getCached({
    provider: "espn-summary",
    url: `${SITE}/summary?event=${encodeURIComponent(id)}`,
    fixture: `espn-summary-${id}`,
    // Short TTL so live box scores stay current; only fetched when someone opens a game page.
    ttlMs: 30_000,
    parse: parseSummary,
  });
}

// ---------- rosters ----------

export function parseRoster(raw: string, teamId: string): RosterPlayer[] {
  const j = parseJson(raw);
  let athletes = arr(get(j, "athletes"));
  // Older format groups athletes by position: [{ position: "Guards", items: [...] }]
  if (athletes.length && Array.isArray(get(athletes[0], "items"))) athletes = athletes.flatMap((g) => arr(get(g, "items")));
  if (!Array.isArray(get(j, "athletes"))) throw new Error("missing athletes[]");
  return mapSafe(athletes, (a) => {
    const id = str(get(a, "id"));
    const name = str(get(a, "displayName")) ?? str(get(a, "fullName"));
    if (!id || !name) return null;
    return {
      id,
      name,
      teamId,
      jersey: str(get(a, "jersey")),
      position: str(get(a, "position", "abbreviation")),
      height: str(get(a, "displayHeight")),
      weight: str(get(a, "displayWeight")),
      age: num(get(a, "age")),
      experience: num(get(a, "experience", "years")),
      college: str(get(a, "college", "name")) ?? str(get(a, "college", "shortName")),
      injuryStatus: str(get(a, "injuries", 0, "status")),
    };
  }).out;
}

export async function getRoster(teamId: string) {
  return getCached({
    provider: "espn-roster",
    url: `${SITE}/teams/${encodeURIComponent(teamId)}/roster`,
    fixture: `espn-roster-${teamId}`,
    ttlMs: 6 * 60 * MIN,
    parse: (raw) => parseRoster(raw, teamId),
  });
}

// ---------- team schedule ----------

export function parseSchedule(raw: string, teamId: string): ScheduleGame[] {
  const j = parseJson(raw);
  if (!Array.isArray(get(j, "events"))) throw new Error("missing events[]");
  return mapSafe(arr(get(j, "events")), (ev) => {
    const g = parseGame(ev);
    if (!g) return null;
    const us = g.home.id === teamId ? g.home : g.away.id === teamId ? g.away : null;
    if (!us) return null;
    const them = us === g.home ? g.away : g.home;
    const score = g.state === "post" && us.score != null && them.score != null ? `${us.score}-${them.score}` : null;
    const result = g.state === "post" && us.score != null && them.score != null ? (us.score > them.score ? "W" : "L") : null;
    return { id: g.id, date: g.date, opponent: { id: them.id, abbr: them.abbr, name: them.name }, homeAway: us.homeAway, state: g.state, result, score };
  }).out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export async function getSchedule(teamId: string, seasonYear = espnSeasonYear(new Date())) {
  return getCached({
    provider: "espn-schedule",
    url: `${SITE}/teams/${encodeURIComponent(teamId)}/schedule?season=${seasonYear}&seasontype=2`,
    fixture: `espn-schedule-${teamId}`,
    ttlMs: 30 * MIN,
    parse: (raw) => parseSchedule(raw, teamId),
  });
}

// ---------- injuries ----------

export function parseInjuries(raw: string): InjuryEntry[] {
  const j = parseJson(raw);
  if (!Array.isArray(get(j, "injuries"))) throw new Error("missing injuries[]");
  const out: InjuryEntry[] = [];
  for (const teamBlock of arr(get(j, "injuries"))) {
    const team = teamById(str(get(teamBlock, "id"))) ?? teamByAbbr(str(get(teamBlock, "abbreviation")));
    const entries = mapSafe(arr(get(teamBlock, "injuries")), (inj) => {
      const name = str(get(inj, "athlete", "displayName"));
      const status = str(get(inj, "status"));
      if (!name || !status) return null;
      const links = arr(get(inj, "athlete", "links"));
      const href = links.map((l) => str(get(l, "href")) ?? "").find((h) => /\/id\/\d+/.test(h)) ?? "";
      const pid = str(get(inj, "athlete", "id")) ?? /\/id\/(\d+)/.exec(href)?.[1] ?? null;
      const athTeam = teamById(str(get(inj, "athlete", "team", "id"))) ?? team;
      if (!athTeam) return null;
      const typeDesc = str(get(inj, "details", "type")) ?? str(get(inj, "type", "description"));
      const loc = [str(get(inj, "details", "side")), str(get(inj, "details", "location"))].filter(Boolean).join(" ");
      return {
        playerId: pid,
        playerName: name,
        teamId: athTeam.id,
        teamAbbr: athTeam.abbr,
        status,
        reportedAt: isoDate(get(inj, "date")),
        injury: [loc, typeDesc].filter(Boolean).join(" — ") || null,
        detail: stripHtml(str(get(inj, "shortComment")) ?? str(get(inj, "longComment"))) || null,
        returnDate: str(get(inj, "details", "returnDate")),
        sourceName: "ESPN injury feed",
        // ESPN compiles this from team/league reports; it is not the league's official report itself.
        official: false,
      };
    }).out;
    out.push(...entries);
  }
  return out;
}

export async function getInjuries() {
  return getCached({ provider: "espn-injuries", url: `${SITE}/injuries`, fixture: "espn-injuries", ttlMs: 5 * MIN, parse: parseInjuries });
}

// ---------- standings ----------

export function parseStandings(raw: string): StandingRow[] {
  const j = parseJson(raw);
  const children = arr(get(j, "children"));
  if (!children.length) throw new Error("missing children[]");
  const rows: StandingRow[] = [];
  for (const conf of children) {
    const label = `${str(get(conf, "name")) ?? ""} ${str(get(conf, "abbreviation")) ?? ""}`;
    const conference: "East" | "West" = /east/i.test(label) ? "East" : "West";
    rows.push(
      ...mapSafe(arr(get(conf, "standings", "entries")), (e) => {
        const team = teamRef(get(e, "team"));
        if (!team) return null;
        const stats = new Map<string, J>();
        for (const s of arr(get(e, "stats"))) {
          const n = str(get(s, "name")) ?? str(get(s, "type"));
          if (n) stats.set(n, s);
        }
        const v = (n: string) => num(get(stats.get(n), "value"));
        const d = (n: string) => str(get(stats.get(n), "displayValue"));
        const wins = v("wins");
        const losses = v("losses");
        if (wins == null || losses == null) return null;
        return {
          team,
          conference,
          wins,
          losses,
          pct: v("winPercent"),
          gb: d("gamesBehind"),
          streak: d("streak"),
          seed: v("playoffSeed"),
          ppg: v("avgPointsFor"),
          oppPpg: v("avgPointsAgainst"),
        };
      }).out,
    );
  }
  return rows;
}

export async function getStandings() {
  return getCached({ provider: "espn-standings", url: STANDINGS, fixture: "espn-standings", ttlMs: 30 * MIN, parse: parseStandings });
}

// ---------- news ----------

export function parseNews(raw: string, fetchedAt: string | null, mode: "live" | "demo" = "live"): ContentItem[] {
  const j = parseJson(raw);
  if (!Array.isArray(get(j, "articles"))) throw new Error("missing articles[]");
  return mapSafe(arr(get(j, "articles")), (a) => {
    const title = stripHtml(str(get(a, "headline")));
    const published = isoDate(get(a, "published"));
    if (!title || !published) return null;
    const summary = truncate(stripHtml(str(get(a, "description"))), 400);
    const typeStr = str(get(a, "type")) ?? "";
    const isVideo = /media|video/i.test(typeStr);
    const text = `${title}. ${summary}`;
    const { type, tags } = classify(text, { isVideo, title });
    const playerIds: string[] = [];
    const teamIds: string[] = [];
    for (const c of arr(get(a, "categories"))) {
      const ct = str(get(c, "type"));
      if (ct === "athlete") {
        const id = str(get(c, "athleteId")) ?? str(get(c, "athlete", "id"));
        if (id) playerIds.push(id);
      } else if (ct === "team") {
        const t = teamById(str(get(c, "teamId")) ?? str(get(c, "team", "id")));
        if (t) teamIds.push(t.id);
      }
    }
    const url = safeUrl(get(a, "links", "web", "href"));
    const premium = bool(get(a, "premium")) ?? false;
    return {
      id: `espn_${str(get(a, "id")) ?? title}`,
      title,
      summary: premium ? `${summary} (ESPN+ subscriber article)` : summary,
      type,
      tags,
      playerIds,
      teamIds,
      gameIds: [],
      publishedAt: published,
      updatedAt: isoDate(get(a, "lastModified")),
      sourceId: "espn-api",
      sourceName: "ESPN",
      sourceCategory: "national",
      url,
      verification: verify(text, "national"),
      citedOrigin: citedOrigin(text),
      thumbnail: safeUrl(get(a, "images", 0, "url")),
      playback: isVideo ? { kind: "external", reason: "ESPN video plays on espn.com; embedding isn't offered for third-party apps." } : null,
      byline: str(get(a, "byline")),
      provenance: { provider: "espn-news", mode, fetchedAt },
    } satisfies ContentItem;
  }).out;
}

export async function getEspnNews() {
  // Parse twice so demo items are labeled demo. Cheap: parsing is fast and the raw text is small.
  const res = await getCached({
    provider: "espn-news",
    url: `${SITE}/news?limit=50`,
    fixture: "espn-news",
    ttlMs: 3 * MIN,
    parse: (raw) => raw,
  });
  if (res.value == null) return { value: null, meta: res.meta };
  return { value: parseNews(res.value, res.meta.fetchedAt, res.meta.mode === "demo" ? "demo" : "live"), meta: res.meta };
}

// ---------- athletes ----------

export function parseAthlete(raw: string): PlayerBio {
  const j = parseJson(raw);
  const a = get(j, "athlete") ?? j;
  const id = str(get(a, "id"));
  const name = str(get(a, "displayName")) ?? str(get(a, "fullName"));
  if (!id || !name) throw new Error("missing athlete id/name");
  return {
    id,
    name,
    team: teamRef(get(a, "team")),
    position: str(get(a, "position", "abbreviation")),
    jersey: str(get(a, "jersey")),
    height: str(get(a, "displayHeight")),
    weight: str(get(a, "displayWeight")),
    age: num(get(a, "age")),
    birthDate: str(get(a, "displayDOB")) ?? (isoDate(get(a, "dateOfBirth"))?.slice(0, 10) ?? null),
    experience: num(get(a, "experience", "years")) ?? num(get(a, "displayExperience")),
    college: str(get(a, "college", "name")),
    headshot: safeUrl(get(a, "headshot", "href")),
    status: str(get(a, "injuries", 0, "status")) ?? str(get(a, "status", "name")),
  };
}

export async function getAthlete(id: string) {
  return getCached({
    provider: "espn-athlete",
    url: `${CORE_WEB}/athletes/${encodeURIComponent(id)}`,
    fixture: `espn-athlete-${id}`,
    ttlMs: 60 * MIN,
    parse: parseAthlete,
  });
}

const LOG_FIELDS: Record<string, string[]> = {
  min: ["MIN", "minutes"],
  fg: ["FG", "fieldGoalsMade-fieldGoalsAttempted"],
  tp: ["3PT", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"],
  ft: ["FT", "freeThrowsMade-freeThrowsAttempted"],
  reb: ["REB", "totalRebounds"],
  oreb: ["OR", "OREB", "offensiveRebounds"],
  ast: ["AST", "assists"],
  blk: ["BLK", "blocks"],
  stl: ["STL", "steals"],
  pf: ["PF", "fouls"],
  tov: ["TO", "turnovers"],
  pts: ["PTS", "points"],
};

export function parseGameLog(raw: string): GameLogEntry[] {
  const j = parseJson(raw);
  const labels = arr(get(j, "labels")).map((l) => str(l) ?? "");
  const names = arr(get(j, "names")).map((l) => str(l) ?? "");
  const idx = (k: string) => {
    for (const cand of LOG_FIELDS[k]) {
      const i = labels.indexOf(cand);
      if (i >= 0) return i;
      const n = names.indexOf(cand);
      if (n >= 0) return n;
    }
    return -1;
  };
  const I = Object.fromEntries(Object.keys(LOG_FIELDS).map((k) => [k, idx(k)]));
  if (I.pts < 0) throw new Error("game log has no PTS column");
  const meta = obj(get(j, "events")) ?? {};
  const out: GameLogEntry[] = [];
  const seenIds = new Set<string>();
  for (const st of arr(get(j, "seasonTypes"))) {
    const label = (str(get(st, "displayName")) ?? "").toLowerCase();
    const seasonType: GameLogEntry["seasonType"] = /post|playoff/.test(label) ? "playoffs" : /pre/.test(label) ? "preseason" : /regular/.test(label) ? "regular" : "other";
    for (const cat of arr(get(st, "categories"))) {
      const rows = mapSafe(arr(get(cat, "events")), (e) => {
        const gid = str(get(e, "eventId"));
        if (!gid || seenIds.has(gid)) return null;
        const s = arr(get(e, "stats"));
        const m = meta[gid];
        const date = isoDate(get(m, "gameDate"));
        if (!date || s.length === 0) return null;
        const n = (k: string) => (I[k] >= 0 ? num(s[I[k]]) ?? 0 : 0);
        const [fgm, fga] = madeAttempted(s[I.fg]);
        const [tpm, tpa] = madeAttempted(s[I.tp]);
        const [ftm, fta] = madeAttempted(s[I.ft]);
        seenIds.add(gid);
        return {
          gameId: gid,
          date,
          opponent: teamByAbbr(str(get(m, "opponent", "abbreviation")))?.abbr ?? str(get(m, "opponent", "abbreviation")) ?? "?",
          homeAway: str(get(m, "atVs")) === "@" ? "away" : "home",
          result: [str(get(m, "gameResult")), str(get(m, "score"))].filter(Boolean).join(" ") || null,
          seasonType,
          min: n("min"),
          pts: n("pts"),
          reb: n("reb"),
          oreb: I.oreb >= 0 ? n("oreb") : null,
          ast: n("ast"),
          stl: n("stl"),
          blk: n("blk"),
          tov: n("tov"),
          pf: n("pf"),
          fgm,
          fga,
          tpm,
          tpa,
          ftm,
          fta,
        } satisfies GameLogEntry;
      }).out;
      out.push(...rows);
    }
  }
  return out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

const CAREER_KEYS: Record<string, string> = {
  GP: "gp",
  GS: "gs",
  MIN: "min",
  "FG%": "fgPct",
  "3P%": "tpPct",
  "FT%": "ftPct",
  OR: "oreb",
  DR: "dreb",
  REB: "reb",
  AST: "ast",
  BLK: "blk",
  STL: "stl",
  PF: "pf",
  TO: "tov",
  PTS: "pts",
};

export function parseCareer(raw: string): SeasonLine[] {
  const j = parseJson(raw);
  const cats = arr(get(j, "categories"));
  const avg = cats.find((c) => /averages/i.test(str(get(c, "name")) ?? "")) ?? cats[0];
  if (!avg) return [];
  const labels = arr(get(avg, "labels")).map((l) => str(l) ?? "");
  return mapSafe(arr(get(avg, "statistics")), (row) => {
    const season = str(get(row, "season", "displayName"));
    if (!season) return null;
    const vals = arr(get(row, "stats"));
    const stats: Record<string, number | null> = {};
    labels.forEach((l, i) => {
      const key = CAREER_KEYS[l];
      if (key) stats[key] = num(vals[i]);
      if (l === "FG" || l === "3PT" || l === "FT") {
        const m = /^([\d.]+)-([\d.]+)$/.exec(str(vals[i]) ?? "");
        const p = l === "FG" ? "fg" : l === "3PT" ? "tp" : "ft";
        stats[`${p}m`] = m ? Number(m[1]) : null;
        stats[`${p}a`] = m ? Number(m[2]) : null;
      }
    });
    // FG% etc. arrive as 47.5 (percent); normalize to 0..1.
    for (const k of ["fgPct", "tpPct", "ftPct"]) if (stats[k] != null && stats[k]! > 1) stats[k] = stats[k]! / 100;
    const team = teamById(str(get(row, "teamId")))?.abbr ?? str(get(row, "teamSlug"));
    return { season, seasonType: "regular", team, gp: stats.gp ?? null, stats } satisfies SeasonLine;
  }).out;
}

export async function getPlayerStats(id: string, seasonYear: number): Promise<{ value: PlayerStats | null; meta: Fetched<unknown>["meta"][] }> {
  const [log, career] = await Promise.all([
    getCached({
      provider: "espn-gamelog",
      url: `${CORE_WEB}/athletes/${encodeURIComponent(id)}/gamelog?season=${seasonYear}`,
      fixture: seasonYear === espnSeasonYear(new Date()) ? `espn-gamelog-${id}` : `espn-gamelog-${id}-prev`,
      ttlMs: 15 * MIN,
      parse: parseGameLog,
    }),
    getCached({
      provider: "espn-career",
      url: `${CORE_WEB}/athletes/${encodeURIComponent(id)}/stats`,
      fixture: `espn-career-${id}`,
      ttlMs: 6 * 60 * MIN,
      parse: parseCareer,
    }),
  ]);
  if (log.value == null && career.value == null) return { value: null, meta: [log.meta, career.meta] };
  return {
    value: { season: seasonLabelFromEspnYear(seasonYear), log: log.value ?? [], careerAverages: career.value ?? [] },
    meta: [log.meta, career.meta],
  };
}
