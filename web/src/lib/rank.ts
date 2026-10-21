import type { ContentType, SourceCategory, StoryCluster, Verification } from "./types";
import { sourceById } from "./sources";
import { normalize } from "./text";

// ---------- Importance (computed server-side, independent of the user) ----------

const SEVERE_INJURY = /\b(ruled out|out for the season|out indefinitely|torn|tear|fracture|surgery|achilles|acl|will miss|out \d+|weeks|months)\b/i;
const GAME_DAY_STATUS = /\b(questionable|doubtful|game-time decision|ruled out|out tonight|will not play|won't play|upgraded|downgraded)\b/i;
const RECORD = /\b(record|career-high|career high|franchise-record|all-time|milestone|triple-double|50[- ]point|60[- ]point)\b/i;
const OFFICIAL_MOVE = /\b(trade[sd]?|acquire[sd]?|sign(s|ed)?|waive[sd]?|extension)\b/i;

const BASE: Record<ContentType, number> = {
  injury: 0.5,
  transaction: 0.55,
  lineup: 0.5,
  rumor: 0.35,
  result: 0.4,
  highlight: 0.45,
  news: 0.35,
  analysis: 0.25,
  fantasy: 0.25,
  interview: 0.25,
  history: 0.15,
};

export function importanceOf(c: StoryCluster, starIds: Set<string>): { score: number; reasons: string[] } {
  const text = c.items.map((i) => `${i.title} ${i.summary}`).join(" ");
  let s = BASE[c.type];
  const reasons: string[] = [];
  const star = c.playerIds.some((id) => starIds.has(id));
  if (c.type === "injury") {
    if (SEVERE_INJURY.test(text)) {
      s += 0.2;
      reasons.push("Significant injury");
    } else if (GAME_DAY_STATUS.test(text)) {
      s += 0.12;
      reasons.push("Game-day availability");
    }
    if (star) {
      s += 0.2;
      reasons.push("Star player injury");
    }
  } else if (c.type === "transaction") {
    if (OFFICIAL_MOVE.test(text) && c.verification === "official") {
      s += 0.2;
      reasons.push("Official roster move");
    }
    if (star) {
      s += 0.15;
      reasons.push("Involves a star");
    }
  } else if (c.type === "lineup") {
    s += 0.1;
    reasons.push("Lineup change");
  } else if (star) {
    s += 0.1;
    reasons.push("Involves a star");
  }
  if (RECORD.test(text) && c.type !== "history") {
    s += 0.12;
    reasons.push("Record or milestone");
  }
  if (c.verification === "official") reasons.push("Official update");
  if (c.independentSources.length >= 2) {
    s += Math.min(0.15, 0.05 * c.independentSources.length);
    reasons.push(`${c.independentSources.length} outlets reporting`);
  }
  if (c.items.length > 1 && c.type === "injury") reasons.push("Status updated");
  return { score: Math.min(1, s), reasons };
}

// ---------- Personal ranking + filtering (runs in the browser) ----------

export interface RankPrefs {
  followedTeams: string[];
  followedPlayers: string[];
  preferredTypes: ContentType[];
  mutedTypes: ContentType[];
  mutedKeywords: string[];
  hiddenSources: string[];
  /** Teams/players derived from saved stories — explicit actions only. */
  savedAffinity: { teamIds: string[]; playerIds: string[] };
}

export const EMPTY_RANK_PREFS: RankPrefs = {
  followedTeams: [],
  followedPlayers: [],
  preferredTypes: [],
  mutedTypes: [],
  mutedKeywords: [],
  hiddenSources: [],
  savedAffinity: { teamIds: [], playerIds: [] },
};

const VERIF_WEIGHT: Record<Verification, number> = { official: 1, reported: 0.75, unconfirmed: 0.4, rumor: 0.3 };

export interface Ranked {
  cluster: StoryCluster;
  score: number;
  reasons: string[];
  breaking: boolean;
}

/**
 * score = 0.35·recency + 0.3·importance + 0.15·credibility + 0.15·personal + 0.05·quality
 * Recency halves roughly every 8 hours. Engagement metrics are never used.
 */
export function rankCluster(c: StoryCluster, prefs: RankPrefs, now: number): Ranked {
  const ageH = Math.max(0, (now - Date.parse(c.lastUpdatedAt)) / 3600_000);
  const recency = Math.exp(-ageH / 12);
  const cred = Math.max(
    ...c.items.map((i) => (sourceById(i.sourceId)?.credibility ?? 0.5) * VERIF_WEIGHT[i.verification]),
  );
  const reasons = [...c.importanceReasons];
  let personal = 0;
  if (c.playerIds.some((p) => prefs.followedPlayers.includes(p))) {
    personal += 0.6;
    reasons.unshift("Player you follow");
  } else if (c.teamIds.some((t) => prefs.followedTeams.includes(t))) {
    personal += 0.45;
    reasons.unshift("Team you follow");
  } else if (
    c.playerIds.some((p) => prefs.savedAffinity.playerIds.includes(p)) ||
    c.teamIds.some((t) => prefs.savedAffinity.teamIds.includes(t))
  ) {
    personal += 0.2;
    reasons.push("Similar to stories you saved");
  }
  if (prefs.preferredTypes.includes(c.type)) {
    personal += 0.3;
    reasons.push("Category you prefer");
  }
  const quality = (c.lead.summary.length > 60 ? 0.5 : 0.2) + (c.lead.playback?.kind === "youtube" ? 0.5 : 0.2);
  const score = 0.35 * recency + 0.3 * c.importance + 0.15 * cred + 0.15 * Math.min(1, personal) + 0.05 * Math.min(1, quality);
  if (ageH < 3) reasons.push("Recent");
  const breaking = ageH < 3 && c.importance >= 0.7 && c.verification !== "rumor";
  return { cluster: c, score, reasons: [...new Set(reasons)].slice(0, 4), breaking };
}

export interface FeedFilter {
  types: ContentType[];
  teamIds: string[];
  playerIds: string[];
  /** null = any time. */
  sinceHours: number | null;
  verification: "all" | "official" | "credible" | "unconfirmed";
  sourceCategories: SourceCategory[];
  freshness: "all" | "fresh" | "archive";
  sort: "ranked" | "latest";
}

export const DEFAULT_FILTER: FeedFilter = {
  types: [],
  teamIds: [],
  playerIds: [],
  sinceHours: null,
  verification: "all",
  sourceCategories: [],
  freshness: "all",
  sort: "ranked",
};

export function isMuted(c: StoryCluster, prefs: RankPrefs): boolean {
  if (prefs.mutedTypes.includes(c.type)) return true;
  if (c.items.every((i) => prefs.hiddenSources.includes(i.sourceId))) return true;
  if (prefs.mutedKeywords.length) {
    const text = normalize(c.items.map((i) => `${i.title} ${i.summary}`).join(" "));
    if (prefs.mutedKeywords.some((k) => k.trim() && text.includes(normalize(k)))) return true;
  }
  return false;
}

export function matchesFilter(c: StoryCluster, f: FeedFilter, now: number): boolean {
  // Primary type only: "Injuries" means injury stories, not a fantasy column that mentions one.
  if (f.types.length && !f.types.includes(c.type)) return false;
  if (f.teamIds.length && !c.teamIds.some((t) => f.teamIds.includes(t))) return false;
  if (f.playerIds.length && !c.playerIds.some((p) => f.playerIds.includes(p))) return false;
  const ageH = (now - Date.parse(c.lastUpdatedAt)) / 3600_000;
  if (f.sinceHours != null && ageH > f.sinceHours) return false;
  if (f.freshness === "fresh" && ageH > 24) return false;
  if (f.freshness === "archive" && ageH <= 24) return false;
  if (f.verification === "official" && c.verification !== "official") return false;
  if (f.verification === "credible" && !(c.verification === "official" || c.verification === "reported")) return false;
  if (f.verification === "unconfirmed" && !(c.verification === "unconfirmed" || c.verification === "rumor")) return false;
  if (f.sourceCategories.length && !c.items.some((i) => f.sourceCategories.includes(i.sourceCategory))) return false;
  return true;
}

export function buildFeed(clusters: StoryCluster[], f: FeedFilter, prefs: RankPrefs, now: number): Ranked[] {
  const out: Ranked[] = [];
  for (const c of clusters) {
    if (isMuted(c, prefs) || !matchesFilter(c, f, now)) continue;
    out.push(rankCluster(c, prefs, now));
  }
  if (f.sort === "latest") out.sort((a, b) => Date.parse(b.cluster.lastUpdatedAt) - Date.parse(a.cluster.lastUpdatedAt));
  else out.sort((a, b) => b.score - a.score || Date.parse(b.cluster.lastUpdatedAt) - Date.parse(a.cluster.lastUpdatedAt));
  return out;
}
