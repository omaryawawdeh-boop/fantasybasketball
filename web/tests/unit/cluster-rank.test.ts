import { describe, expect, it } from "vitest";
import { clusterItems } from "@/lib/cluster";
import { buildFeed, DEFAULT_FILTER, EMPTY_RANK_PREFS, importanceOf, matchesFilter, rankCluster } from "@/lib/rank";
import { buildEntityIndex, linkEntities } from "@/lib/entities";
import { at, item } from "./helpers";

const imp = (c: Parameters<typeof importanceOf>[0]) => importanceOf(c, new Set(["p1"]));

describe("entity linking", () => {
  const idx = buildEntityIndex([
    { id: "p1", name: "Jalen Brunson", teamId: "18" },
    { id: "p2", name: "Draymond Green", teamId: "9" },
    { id: "p3", name: "Jeff Green", teamId: "10" },
  ]);
  it("matches full names and adds the player's team", () => {
    expect(linkEntities("Jalen Brunson scores 40", idx)).toEqual({ playerIds: ["p1"], teamIds: ["18"] });
  });
  it("matches a unique last name only when the team is mentioned too", () => {
    expect(linkEntities("Brunson scores 40", idx).playerIds).toEqual([]);
    expect(linkEntities("Knicks: Brunson scores 40", idx).playerIds).toEqual(["p1"]);
  });
  it("ambiguous last names never match", () => {
    expect(linkEntities("Warriors: Green ejected", idx).playerIds).toEqual([]);
  });
  it("team nicknames are case-sensitive (\"heat check\" is not Miami)", () => {
    expect(linkEntities("a real heat check", idx).teamIds).toEqual([]);
    expect(linkEntities("Heat win again", idx).teamIds).toEqual(["14"]);
  });
});

describe("clustering", () => {
  it("merges the same event from several outlets and keeps every report", () => {
    const items = [
      item({ title: "Thunder agree to trade for Heat wing Nico Arrowsmith", type: "transaction", playerIds: ["p9"], publishedAt: at(10) }),
      item({ title: "Heat trading Nico Arrowsmith to Thunder", type: "transaction", playerIds: ["p9"], sourceId: "cbs", sourceName: "CBS Sports", publishedAt: at(11) }),
      item({ title: "Thunder land Arrowsmith from Heat", type: "transaction", playerIds: ["p9"], sourceId: "hoopshype", sourceName: "HoopsHype", sourceCategory: "aggregator", verification: "unconfirmed", publishedAt: at(12) }),
    ];
    const cs = clusterItems(items, imp);
    expect(cs).toHaveLength(1);
    expect(cs[0].items).toHaveLength(3);
    expect(cs[0].independentSources).toEqual(["ESPN", "CBS Sports"]);
    expect(cs[0].originalSourceName).toBe("ESPN");
  });

  it("multiple outlets repeating a report never make it official", () => {
    const items = ["ESPN", "CBS", "Yahoo"].map((s, i) =>
      item({ title: "Star guard agrees to extension with Knicks", type: "transaction", playerIds: ["p1"], sourceName: s, sourceId: s, publishedAt: at(10 + i) }),
    );
    const [c] = clusterItems(items, imp);
    expect(c.verification).toBe("reported");
  });

  it("an injury status change joins the same story and preserves the original status", () => {
    const q = item({ title: "Brunson questionable with ankle sprain", type: "injury", playerIds: ["p1"], publishedAt: at(9) });
    const o = item({ title: "Knicks rule out Brunson tonight", type: "injury", playerIds: ["p1"], publishedAt: at(17) });
    const [c] = clusterItems([o, q], imp);
    expect(c.items.map((i) => i.title)).toEqual([q.title, o.title]);
    expect(c.firstPublishedAt).toBe(at(9));
    expect(c.lastUpdatedAt).toBe(at(17));
  });

  it("does not merge different developments about the same player", () => {
    const a = item({ title: "Brunson sprains ankle, will miss Friday", type: "injury", playerIds: ["p1"], publishedAt: at(9) });
    const b = item({ title: "Brunson agrees to contract extension", type: "transaction", playerIds: ["p1"], publishedAt: at(10) });
    expect(clusterItems([a, b], imp)).toHaveLength(2);
  });

  it("different highlight clips stay separate even with boilerplate descriptions", () => {
    const d = "Subscribe to the channel for more highlights every night of the season";
    const a = item({ title: "Top 10 plays of the night", summary: d, type: "highlight", publishedAt: at(9) });
    const b = item({ title: "Wembanyama 8-block game highlights", summary: d, type: "highlight", publishedAt: at(10) });
    expect(clusterItems([a, b], imp)).toHaveLength(2);
  });

  it("de-duplicates the same URL from two feeds (ignoring tracking params)", () => {
    const a = item({ title: "Same story", url: "https://espn.com/a?utm_source=rss", publishedAt: at(9) });
    const b = item({ title: "Same story", url: "https://espn.com/a", publishedAt: at(9) });
    const cs = clusterItems([a, b], imp);
    expect(cs).toHaveLength(1);
    expect(cs[0].items).toHaveLength(1);
  });

  it("distinct YouTube videos are not de-duplicated by URL", () => {
    const a = item({ title: "Brunson 40-point highlights", url: "https://www.youtube.com/watch?v=aaaaaaa", type: "highlight" });
    const b = item({ title: "Tatum game-winner vs Heat", url: "https://www.youtube.com/watch?v=bbbbbbb", type: "highlight" });
    expect(clusterItems([a, b], imp)).toHaveLength(2);
  });
});

describe("importance and ranking", () => {
  it("a star ruled out outranks routine analysis", () => {
    const [inj] = clusterItems([item({ title: "Brunson ruled out tonight", type: "injury", playerIds: ["p1"] })], imp);
    const [ana] = clusterItems([item({ title: "Power rankings: week 1", type: "analysis" })], imp);
    expect(inj.importance).toBeGreaterThan(ana.importance);
    expect(inj.importanceReasons).toContain("Star player injury");
  });

  it("follows boost relevance and explain why", () => {
    const now = Date.parse(at(13));
    const [c] = clusterItems([item({ title: "Knicks practice notes", teamIds: ["18"], publishedAt: at(12) })], imp);
    const plain = rankCluster(c, EMPTY_RANK_PREFS, now);
    const followed = rankCluster(c, { ...EMPTY_RANK_PREFS, followedTeams: ["18"] }, now);
    expect(followed.score).toBeGreaterThan(plain.score);
    expect(followed.reasons[0]).toBe("Team you follow");
  });

  it("filters compose: Knicks injuries from the last 48 hours", () => {
    const now = Date.parse(at(20));
    const cs = clusterItems(
      [
        item({ title: "Knicks guard out with sprain", type: "injury", teamIds: ["18"], publishedAt: at(18) }),
        item({ title: "Celtics forward out with sprain", type: "injury", teamIds: ["2"], publishedAt: at(18) }),
        item({ title: "Knicks sign forward", type: "transaction", teamIds: ["18"], publishedAt: at(18) }),
        item({ title: "Knicks guard injured last week", type: "injury", teamIds: ["18"], publishedAt: new Date(Date.parse(at(18)) - 5 * 86400_000).toISOString() }),
      ],
      imp,
    );
    const f = { ...DEFAULT_FILTER, types: ["injury" as const], teamIds: ["18"], sinceHours: 48 };
    const out = cs.filter((c) => matchesFilter(c, f, now));
    expect(out.map((c) => c.lead.title)).toEqual(["Knicks guard out with sprain"]);
  });

  it("muted categories, keywords and hidden sources are removed from the feed", () => {
    const now = Date.parse(at(13));
    const cs = clusterItems(
      [
        item({ title: "Power rankings week 1", type: "analysis", publishedAt: at(12) }),
        item({ title: "Rumor mill roundup", type: "rumor", publishedAt: at(12) }),
        item({ title: "Hidden source story", sourceId: "hoopshype", publishedAt: at(11) }),
        item({ title: "Keep me", publishedAt: at(10) }),
      ],
      imp,
    );
    const out = buildFeed(cs, DEFAULT_FILTER, { ...EMPTY_RANK_PREFS, mutedTypes: ["rumor"], mutedKeywords: ["power rankings"], hiddenSources: ["hoopshype"] }, now);
    expect(out.map((r) => r.cluster.lead.title)).toEqual(["Keep me"]);
  });

  it("verification filter: official only", () => {
    const now = Date.parse(at(13));
    const cs = clusterItems([item({ title: "Team announces signing", verification: "official" }), item({ title: "Report says", verification: "reported" })], imp);
    expect(buildFeed(cs, { ...DEFAULT_FILTER, verification: "official" }, EMPTY_RANK_PREFS, now)).toHaveLength(1);
  });
});
