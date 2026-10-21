import "server-only";
import type { ContentItem, RosterPlayer, SourceMeta, StoryCluster } from "@/lib/types";
import { TEAMS } from "@/lib/teams";
import { buildEntityIndex, linkEntities, type EntityIndex } from "@/lib/entities";
import { clusterItems } from "@/lib/cluster";
import { importanceOf } from "@/lib/rank";
import { normalize } from "@/lib/text";
import tierSheet from "@/data/tier-sheet-2025-26.json";
import { getEspnNews, getRoster } from "./providers/espn";
import { checkEmbeddable, getFeedItems } from "./providers/feeds";
import { mapLimit } from "./fetcher";

// The feed pipeline: fetch all sources → link players/teams → cluster duplicates → score importance.
// Personal ranking and filtering happen in the browser so they respond instantly.

export interface PlayerIndexResult {
  players: RosterPlayer[];
  meta: SourceMeta[];
}

let indexMemo: { at: number; value: PlayerIndexResult; index: EntityIndex } | null = null;

/** All current rosters (30 requests, cached 6h each). Used for linking and player search. */
export async function getPlayerIndex(): Promise<PlayerIndexResult & { index: EntityIndex }> {
  if (indexMemo && Date.now() - indexMemo.at < 5 * 60_000) return { ...indexMemo.value, index: indexMemo.index };
  const results = await mapLimit(TEAMS, 6, (t) => getRoster(t.id));
  const players = results.flatMap((r) => r.value ?? []);
  // Summarize 30 roster metas into one row per mode for the status page.
  const meta = results.map((r) => r.meta);
  const index = buildEntityIndex(players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId })));
  const value = { players, meta };
  indexMemo = { at: Date.now(), value, index };
  return { ...value, index };
}

/** "Star" = top 40 by ESPN preseason rank in the bundled 2025-26 tier sheet. A transparent proxy. */
export function starIds(players: RosterPlayer[]): Set<string> {
  const top = Object.entries((tierSheet as { players: Record<string, { espnRank?: number }> }).players)
    .filter(([, v]) => typeof v.espnRank === "number" && v.espnRank <= 40)
    .map(([name]) => normalize(name));
  const set = new Set(top);
  return new Set(players.filter((p) => set.has(normalize(p.name))).map((p) => p.id));
}

let feedMemo: { at: number; clusters: StoryCluster[]; meta: SourceMeta[] } | null = null;

export async function getFeed(): Promise<{ clusters: StoryCluster[]; meta: SourceMeta[] }> {
  if (feedMemo && Date.now() - feedMemo.at < 60_000) return feedMemo;
  const [espn, feeds, idx] = await Promise.all([getEspnNews(), getFeedItems(), getPlayerIndex()]);
  const items: ContentItem[] = [...(espn.value ?? []), ...feeds.items];

  for (const it of items) {
    const linked = linkEntities(`${it.title}. ${it.summary}`, idx.index, { playerIds: it.playerIds, teamIds: it.teamIds });
    // ESPN category ids for players not on a current roster are kept; they still link to profiles.
    it.playerIds = linked.playerIds;
    it.teamIds = linked.teamIds;
  }

  // Optional YouTube embeddability check (needs YOUTUBE_API_KEY).
  const ytIds = items.flatMap((i) => (i.playback?.kind === "youtube" ? [i.playback.videoId] : []));
  const emb = await checkEmbeddable(ytIds);
  for (const it of items) {
    if (it.playback?.kind === "youtube" && emb.has(it.playback.videoId)) it.playback = { ...it.playback, embeddable: emb.get(it.playback.videoId)! };
  }

  const stars = starIds(idx.players);
  const clusters = clusterItems(items, (c) => importanceOf(c, stars));
  // Keep the payload bounded: the most recent 250 stories.
  clusters.sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt));
  // Roster status (used for linking only) is reported on the Players page, not as feed status.
  const meta = [espn.meta, ...feeds.meta];
  feedMemo = { at: Date.now(), clusters: clusters.slice(0, 250), meta };
  return feedMemo;
}

export function _resetFeedMemo() {
  feedMemo = null;
  indexMemo = null;
}
