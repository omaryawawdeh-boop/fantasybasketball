import type { ContentItem, StoryCluster, Verification } from "./types";
import { hash, jaccard, tokens } from "./text";
import { sourceById } from "./sources";

// Groups items that describe the same underlying event.
//
// Two items join the same cluster when, within a 36-hour window, either
//  (a) their headline+summary token sets are very similar (Jaccard ≥ 0.45), or
//  (b) they share a player, have the same content type, and are moderately similar (≥ 0.2), or
//  (c) they share a player AND both are injury items within 24h (status changes of one injury).
// Items of different types (e.g. an injury and a trade involving the same player) never merge
// through rule (b)/(c), so distinct developments stay separate.

const WINDOW_MS = 36 * 3600_000;

interface Sig {
  item: ContentItem;
  toks: Set<string>;
  titleToks: Set<string>;
  t: number;
}

function similar(a: Sig, b: Sig): boolean {
  if (Math.abs(a.t - b.t) > WINDOW_MS) return false;
  if (a.item.type === "highlight" || b.item.type === "highlight") {
    // Different highlight clips are different content even about the same player. Compare titles
    // only: video descriptions are mostly channel boilerplate.
    return a.item.type === b.item.type && jaccard(a.titleToks, b.titleToks) >= 0.6;
  }
  const j = jaccard(a.toks, b.toks);
  if (j >= 0.45) return true;
  const sharedPlayer = a.item.playerIds.some((p) => b.item.playerIds.includes(p));
  if (!sharedPlayer || a.item.type !== b.item.type) return false;
  if (j >= 0.2) return true;
  return a.item.type === "injury" && Math.abs(a.t - b.t) <= 24 * 3600_000;
}

const VERIFICATION_ORDER: Verification[] = ["official", "reported", "unconfirmed", "rumor"];

function credibility(item: ContentItem): number {
  return sourceById(item.sourceId)?.credibility ?? (item.sourceCategory === "official" ? 0.95 : 0.5);
}

/** Drop fragments and tracking parameters so the same article from two feeds compares equal. */
export function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|ex_cid|ref|cid|src)/i.test(k)) url.searchParams.delete(k);
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function clusterItems(items: ContentItem[], importanceOf: (c: StoryCluster) => { score: number; reasons: string[] }): StoryCluster[] {
  // De-duplicate identical URLs first (same story from two feeds of one publisher).
  const seen = new Map<string, ContentItem>();
  for (const it of items) {
    const key = it.url ? canonicalUrl(it.url) : it.id;
    const prev = seen.get(key);
    if (!prev || (prev.summary.length < it.summary.length && prev.sourceId === it.sourceId)) seen.set(key, it);
  }
  const sigs: Sig[] = [...seen.values()]
    .map((item) => ({
      item,
      toks: new Set(tokens(`${item.title} ${item.summary}`)),
      titleToks: new Set(tokens(item.title)),
      t: Date.parse(item.publishedAt) || 0,
    }))
    .sort((a, b) => a.t - b.t);

  // Union-find over pairwise similarity (n is a few hundred at most).
  const parent = sigs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      if (sigs[j].t - sigs[i].t > WINDOW_MS) break;
      if (similar(sigs[i], sigs[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, ContentItem[]>();
  sigs.forEach((s, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(s.item);
    else groups.set(r, [s.item]);
  });

  const clusters: StoryCluster[] = [];
  for (const group of groups.values()) clusters.push(buildCluster(group, importanceOf));
  return clusters;
}

export function buildCluster(group: ContentItem[], importanceOf: (c: StoryCluster) => { score: number; reasons: string[] }): StoryCluster {
  const items = [...group].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const lead = [...items].sort(
    (a, b) =>
      VERIFICATION_ORDER.indexOf(a.verification) - VERIFICATION_ORDER.indexOf(b.verification) ||
      credibility(b) - credibility(a) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  )[0];
  const independent = [...new Set(items.filter((i) => i.sourceCategory !== "aggregator").map((i) => i.sourceName))];
  const original = items.find((i) => i.sourceCategory !== "aggregator") ?? null;
  // Cluster verification is the strongest per-item verification. Multiple outlets repeating a
  // report never turn it into "official".
  const verification = VERIFICATION_ORDER.find((v) => items.some((i) => i.verification === v)) ?? "unconfirmed";
  const type = lead.type;
  const tags = [...new Set(items.flatMap((i) => [i.type, ...i.tags]))].filter((t) => t !== type);
  const lastUpdatedAt = items
    .map((i) => i.updatedAt ?? i.publishedAt)
    .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  const cluster: StoryCluster = {
    // Keyed on the earliest item so the id is stable as later reports join.
    id: `c_${hash(items[0].id)}`,
    lead,
    items,
    type,
    tags,
    playerIds: [...new Set(items.flatMap((i) => i.playerIds))],
    teamIds: [...new Set(items.flatMap((i) => i.teamIds))],
    firstPublishedAt: items[0].publishedAt,
    lastUpdatedAt,
    verification,
    independentSources: independent,
    originalSourceName: original?.sourceName ?? null,
    importance: 0,
    importanceReasons: [],
  };
  const imp = importanceOf(cluster);
  cluster.importance = imp.score;
  cluster.importanceReasons = imp.reasons;
  return cluster;
}
