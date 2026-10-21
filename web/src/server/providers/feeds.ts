import "server-only";
import { XMLParser } from "fast-xml-parser";
import type { ContentItem, DataMode, SourceMeta } from "@/lib/types";
import { SOURCES, isOfficialHost, type SourceDef } from "@/lib/sources";
import { classify, citedOrigin, verify } from "@/lib/classify";
import { hash, safeUrl, stripHtml, truncate } from "@/lib/text";
import { getCached, mapLimit } from "../fetcher";
import { arr, get, isoDate, str, type J } from "../parse";

// RSS / Atom ingestion (news outlets and YouTube channel feeds). Only titles, short descriptions,
// links and thumbnails are used — never full article bodies — and every item links to the source.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  htmlEntities: true,
  // Guard against entity-expansion abuse in hostile XML.
  allowBooleanAttributes: false,
  // Keep text fields raw: feeds sometimes put unescaped HTML in titles/descriptions, which would
  // otherwise be parsed as XML children and truncate the text.
  stopNodes: ["*.title", "*.description", "*.summary", "*.media:description", "*.media:title", "*.dc:creator"],
});

const NBA_ONLY = /\b(nba|basketball|knicks|celtics|lakers|warriors|bucks|nuggets|76ers|sixers|thunder|mavericks|heat|suns|cavaliers|clippers|kings|pelicans|grizzlies|timberwolves|rockets|spurs|jazz|blazers|pacers|hawks|bulls|pistons|hornets|magic|raptors|wizards|nets)\b/i;

function textOf(v: J): string {
  let s = typeof v === "string" ? v : typeof v === "number" ? String(v) : typeof get(v, "#text") === "string" ? (get(v, "#text") as string) : "";
  // Raw (stop-node) text may still be wrapped in CDATA or carry escaped HTML; unwrap both so
  // stripHtml sees real tags and removes them.
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (/&lt;\/?[a-z]/i.test(s)) s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return s;
}

export function parseRss(raw: string, src: SourceDef, mode: DataMode, fetchedAt: string | null): ContentItem[] {
  const x = parser.parse(raw);
  const channel = get(x, "rss", "channel");
  const isAtom = !channel && get(x, "feed") != null;
  if (!channel && !isAtom) throw new Error("not RSS/Atom");
  const items = isAtom ? arr(get(x, "feed", "entry")).concat(get(x, "feed", "entry") && !Array.isArray(get(x, "feed", "entry")) ? [get(x, "feed", "entry")] : []) : (() => {
    const i = get(channel, "item");
    return Array.isArray(i) ? i : i ? [i] : [];
  })();
  const out: ContentItem[] = [];
  for (const it of items) {
    try {
      const item = src.kind === "youtube" ? youtubeItem(it, src, mode, fetchedAt) : rssItem(it, src, mode, fetchedAt);
      if (item) out.push(item);
    } catch {
      // A malformed item is skipped; the rest of the feed still loads.
    }
  }
  return out;
}

function rssItem(it: J, src: SourceDef, mode: DataMode, fetchedAt: string | null): ContentItem | null {
  const title = stripHtml(textOf(get(it, "title")));
  const link = safeUrl(textOf(get(it, "link")) || get(it, "link", "@href"));
  const published = isoDate(textOf(get(it, "pubDate"))) ?? isoDate(textOf(get(it, "dc:date"))) ?? isoDate(textOf(get(it, "published")));
  if (!title || !published) return null;
  const summary = truncate(stripHtml(textOf(get(it, "description")) || textOf(get(it, "summary"))), 400);
  const text = `${title}. ${summary}`;
  // General sports feeds occasionally carry non-NBA items; keep the app NBA-only.
  if (!NBA_ONLY.test(text) && src.id !== "hoopshype" && src.id !== "realgm") return null;
  const official = isOfficialHost(link);
  const category = official ? "official" : src.category;
  const { type, tags } = classify(text, { title });
  const thumb =
    safeUrl(get(it, "media:content", "@url")) ??
    safeUrl(get(it, "media:thumbnail", "@url")) ??
    safeUrl(get(it, "enclosure", "@url")) ??
    safeUrl(get(it, "media:group", "media:thumbnail", "@url"));
  return {
    id: `${src.id}_${hash(link ?? title + published)}`,
    title,
    summary,
    type,
    tags,
    playerIds: [],
    teamIds: [],
    gameIds: [],
    publishedAt: published,
    updatedAt: null,
    sourceId: src.id,
    sourceName: src.name,
    sourceCategory: category,
    url: link,
    verification: verify(text, official ? "official" : src.category),
    citedOrigin: citedOrigin(text),
    thumbnail: thumb && /\.(jpe?g|png|webp)(\?|$)/i.test(thumb) ? thumb : null,
    playback: null,
    byline: stripHtml(textOf(get(it, "dc:creator")) || textOf(get(it, "author"))) || null,
    provenance: { provider: `rss-${src.id}`, mode, fetchedAt },
  };
}

function youtubeItem(it: J, src: SourceDef, mode: DataMode, fetchedAt: string | null): ContentItem | null {
  const videoId = str(get(it, "yt:videoId"));
  const title = stripHtml(textOf(get(it, "title")) || textOf(get(it, "media:group", "media:title")));
  const published = isoDate(textOf(get(it, "published")));
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId) || !title || !published) return null;
  const desc = truncate(stripHtml(textOf(get(it, "media:group", "media:description"))), 300);
  const text = `${title}. ${desc}`;
  const { type, tags } = classify(text, { isVideo: true, title });
  return {
    id: `yt_${videoId}`,
    title,
    summary: desc,
    type,
    tags,
    playerIds: [],
    teamIds: [],
    gameIds: [],
    publishedAt: published,
    updatedAt: isoDate(textOf(get(it, "updated"))),
    sourceId: src.id,
    sourceName: src.name,
    sourceCategory: src.category,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    verification: src.category === "official" ? "official" : "reported",
    citedOrigin: null,
    // i.ytimg.com thumbnails are provided by YouTube for display alongside embedded videos.
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    playback: mode === "demo" ? { kind: "none", reason: "Demo item — there is no real video behind it." } : { kind: "youtube", videoId, embeddable: null },
    byline: null,
    provenance: { provider: `rss-${src.id}`, mode, fetchedAt },
  };
}

/** Extra YouTube channels from YOUTUBE_CHANNEL_IDS="id1,id2" (labeled as third-party video). */
function extraYoutubeSources(): SourceDef[] {
  return (process.env.YOUTUBE_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^UC[\w-]{20,}$/.test(s))
    .map((id) => ({
      id: `yt-${id}`,
      name: `YouTube channel ${id.slice(0, 8)}…`,
      category: "video" as const,
      kind: "youtube" as const,
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
      hosts: ["youtube.com"],
      credibility: 0.6,
      enabledByDefault: true,
      notes: "Added via YOUTUBE_CHANNEL_IDS.",
    }));
}

export function feedSources(): SourceDef[] {
  const disabled = new Set((process.env.DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()));
  return [...SOURCES.filter((s) => s.kind !== "espn-api"), ...extraYoutubeSources()].filter((s) => s.enabledByDefault && !disabled.has(s.id));
}

export async function getFeedItems(): Promise<{ items: ContentItem[]; meta: SourceMeta[] }> {
  const results = await mapLimit(feedSources(), 4, async (src) => {
    const r = await getCached({
      provider: `rss-${src.id}`,
      url: src.url!,
      fixture: `rss-${src.id}`,
      ttlMs: src.kind === "youtube" ? 10 * 60_000 : 4 * 60_000,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      // One slow feed must not hold up the whole news feed.
      timeoutMs: 5000,
      parse: (raw) => {
        parseRss(raw, src, "live", null); // validate shape
        return raw;
      },
    });
    const items = r.value ? parseRss(r.value, src, r.meta.mode, r.meta.fetchedAt) : [];
    return { items, meta: r.meta };
  });
  return { items: results.flatMap((r) => r.items), meta: results.map((r) => r.meta) };
}

// ---------- Optional: YouTube Data API (needs YOUTUBE_API_KEY) ----------
// Free quota is 10,000 units/day. videos.list costs 1 unit per call (50 ids); search.list costs 100.

export async function checkEmbeddable(ids: string[]): Promise<Map<string, boolean>> {
  const key = process.env.YOUTUBE_API_KEY;
  const out = new Map<string, boolean>();
  if (!key || ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await getCached({
      provider: "youtube-api",
      url: `https://www.googleapis.com/youtube/v3/videos?part=status&id=${batch.join(",")}&key=${encodeURIComponent(key)}`,
      fixture: null,
      ttlMs: 6 * 3600_000,
      parse: (raw) => {
        const j = JSON.parse(raw);
        return arr(get(j, "items")).map((v) => [str(get(v, "id")), get(v, "status", "embeddable") === true] as const);
      },
    });
    for (const [id, ok] of r.value ?? []) if (id) out.set(id, ok);
  }
  return out;
}
