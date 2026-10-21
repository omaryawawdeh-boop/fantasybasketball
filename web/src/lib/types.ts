// Normalized data model shared by the server providers and the UI.
// Providers convert raw source data into these shapes; components never see raw API payloads.

/** How a piece of data reached the app. Shown in the UI wherever it matters. */
export type DataMode = "live" | "cached" | "demo" | "unavailable";

export interface SourceMeta {
  /** Provider key, e.g. "espn-scoreboard". */
  provider: string;
  mode: DataMode;
  /** ISO time of the last successful fetch from the real source (null if never). */
  fetchedAt: string | null;
  error?: string;
}

export interface ApiResult<T> {
  data: T;
  meta: SourceMeta[];
}

export type ContentType =
  | "news"
  | "highlight"
  | "injury"
  | "lineup"
  | "transaction"
  | "result"
  | "analysis"
  | "rumor"
  | "fantasy"
  | "interview"
  | "history";

export const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: "news", label: "News" },
  { id: "highlight", label: "Highlights" },
  { id: "injury", label: "Injuries" },
  { id: "lineup", label: "Lineups" },
  { id: "transaction", label: "Transactions" },
  { id: "result", label: "Results & stats" },
  { id: "analysis", label: "Analysis" },
  { id: "rumor", label: "Rumors" },
  { id: "fantasy", label: "Fantasy" },
  { id: "interview", label: "Interviews" },
  { id: "history", label: "History" },
];

/** Who published something, independent of what it says. (Demo items keep their source's category; demo-ness is in provenance.mode.) */
export type SourceCategory = "official" | "national" | "aggregator" | "video";

/** What we can say about the claim itself. Never upgraded to "official" by repetition. */
export type Verification = "official" | "reported" | "unconfirmed" | "rumor";

export type Playback =
  | { kind: "youtube"; videoId: string; embeddable: boolean | null }
  | { kind: "external"; reason: string }
  | { kind: "none"; reason: string };

export interface ContentItem {
  id: string;
  title: string;
  summary: string;
  type: ContentType;
  /** Secondary types detected in the text, e.g. an injury item that is also fantasy-relevant. */
  tags: ContentType[];
  playerIds: string[];
  teamIds: string[];
  gameIds: string[];
  publishedAt: string;
  updatedAt: string | null;
  sourceId: string;
  sourceName: string;
  sourceCategory: SourceCategory;
  url: string | null;
  verification: Verification;
  /** e.g. "Shams Charania" when the text says "per Shams Charania". Never guessed. */
  citedOrigin: string | null;
  thumbnail: string | null;
  playback: Playback | null;
  byline: string | null;
  /** Where the data came from, for the provenance panel. */
  provenance: { provider: string; mode: DataMode; fetchedAt: string | null };
}

export interface StoryCluster {
  id: string;
  /** Representative item (clearest headline from the most credible source). */
  lead: ContentItem;
  /** All items, oldest first, including the lead. */
  items: ContentItem[];
  type: ContentType;
  tags: ContentType[];
  playerIds: string[];
  teamIds: string[];
  firstPublishedAt: string;
  lastUpdatedAt: string;
  verification: Verification;
  /** Distinct non-aggregator outlets that published within the cluster. */
  independentSources: string[];
  /** Earliest non-aggregator item, i.e. our best guess at the original report. */
  originalSourceName: string | null;
  importance: number;
  importanceReasons: string[];
}

// ---------- Games ----------

export type GameState = "pre" | "in" | "post" | "postponed" | "unknown";

export interface TeamRef {
  id: string;
  abbr: string;
  name: string;
}

export interface GameTeam extends TeamRef {
  score: number | null;
  record: string | null;
  linescores: number[];
  homeAway: "home" | "away";
  winner: boolean | null;
}

export interface Game {
  id: string;
  date: string;
  state: GameState;
  statusText: string;
  period: number | null;
  clock: string | null;
  home: GameTeam;
  away: GameTeam;
  venue: string | null;
  broadcasts: string[];
}

export interface BoxPlayerLine {
  playerId: string;
  name: string;
  position: string | null;
  starter: boolean;
  didNotPlay: boolean;
  dnpReason: string | null;
  stats: Record<string, string>;
}

export interface BoxTeam {
  team: TeamRef;
  labels: string[];
  players: BoxPlayerLine[];
  totals: Record<string, string>;
}

export interface GameDetail {
  game: Game;
  box: BoxTeam[];
  /** True only when the box score marks starters, i.e. the game has started. */
  startersConfirmed: boolean;
}

// ---------- Teams / players ----------

export interface TeamInfo extends TeamRef {
  location: string;
  nickname: string;
  color: string;
  altColor: string;
  conference: "East" | "West";
}

export interface RosterPlayer {
  id: string;
  name: string;
  teamId: string;
  jersey: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  experience: number | null;
  college: string | null;
  injuryStatus: string | null;
}

export interface PlayerBio {
  id: string;
  name: string;
  team: TeamRef | null;
  position: string | null;
  jersey: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  birthDate: string | null;
  experience: number | null;
  college: string | null;
  headshot: string | null;
  status: string | null;
}

/** One game of a player's log. Numbers are raw box-score counts. */
export interface GameLogEntry {
  gameId: string;
  date: string;
  opponent: string;
  homeAway: "home" | "away";
  result: string | null;
  seasonType: "regular" | "playoffs" | "preseason" | "other";
  min: number;
  pts: number;
  reb: number;
  oreb: number | null;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

export interface SeasonLine {
  season: string;
  seasonType: "regular" | "playoffs";
  team: string | null;
  gp: number | null;
  stats: Record<string, number | null>;
}

export interface PlayerStats {
  /** Season label the log refers to, e.g. "2026-27". */
  season: string;
  log: GameLogEntry[];
  careerAverages: SeasonLine[];
}

export interface InjuryEntry {
  playerId: string | null;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  status: string;
  /** ESPN's "date" for the entry — the last time the source updated it. */
  reportedAt: string | null;
  injury: string | null;
  detail: string | null;
  returnDate: string | null;
  sourceName: string;
  official: boolean;
}

export interface StandingRow {
  team: TeamRef;
  conference: "East" | "West";
  wins: number;
  losses: number;
  pct: number | null;
  gb: string | null;
  streak: string | null;
  seed: number | null;
  ppg: number | null;
  oppPpg: number | null;
}

export interface ScheduleGame {
  id: string;
  date: string;
  opponent: TeamRef;
  homeAway: "home" | "away";
  state: GameState;
  result: string | null;
  score: string | null;
}
