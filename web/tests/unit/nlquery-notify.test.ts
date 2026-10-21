import { describe, expect, it } from "vitest";
import { parseQuery } from "@/lib/nlquery";
import { computeEvents, inQuietHours, type NotifSettings } from "@/lib/notify";
import { clusterItems } from "@/lib/cluster";
import { importanceOf } from "@/lib/rank";
import { item } from "./helpers";

const players = [
  { id: "1", name: "Jalen Brunson" },
  { id: "2", name: "Tyrese Maxey" },
  { id: "3", name: "Jalen Green" },
];

describe("natural-language search", () => {
  it("Knicks injuries from the last three days", () => {
    const p = parseQuery("Find every credible report about Knicks injuries from the last three days", players);
    expect(p.filter.teamIds).toEqual(["18"]);
    expect(p.filter.types).toEqual(["injury"]);
    expect(p.filter.sinceHours).toBe(72);
    expect(p.filter.verification).toBe("credible");
    expect(p.chips.map((c) => c.key)).toEqual(expect.arrayContaining(["time", "verification", "types", "team:18"]));
  });

  it("biggest stories this week → ranked, 168h", () => {
    const p = parseQuery("Show me the biggest Celtics stories this week", players);
    expect(p.filter.sort).toBe("ranked");
    expect(p.filter.sinceHours).toBe(168);
    expect(p.filter.teamIds).toEqual(["2"]);
  });

  it("finds players by full name, unique last name and with typos", () => {
    expect(parseQuery("brunson injury", players).filter.playerIds).toEqual(["1"]);
    expect(parseQuery("tyrese maxy", players).filter.playerIds).toEqual(["2"]);
    // "Jalen" alone is ambiguous → no player filter.
    expect(parseQuery("jalen", players).filter.playerIds).toBeUndefined();
  });

  it("detects compare intent", () => {
    expect(parseQuery("compare Jalen Brunson and Tyrese Maxey", players).compare).toEqual(["1", "2"]);
    expect(parseQuery("Brunson vs Maxey", players).compare).toEqual(["1", "2"]);
  });

  it("leaves unknown words as keywords", () => {
    expect(parseQuery("supermax drama", players).text).toBe("supermax drama");
  });
});

describe("notifications", () => {
  const settings: NotifSettings = { enabled: true, breaking: false, injuries: true, lineups: true, transactions: true, gameStart: true, finals: true, fantasy: false, keywords: ["extension"], quietStart: null, quietEnd: null, followedOnly: false };
  const now = Date.now();
  const recent = new Date(now - 3600_000).toISOString();

  it("one event per story update; a new report creates a new key", () => {
    const a = item({ title: "Brunson questionable", type: "injury", playerIds: ["1"], teamIds: ["18"], publishedAt: recent });
    const [c1] = clusterItems([a], (c) => importanceOf(c, new Set()));
    const e1 = computeEvents([c1], [], settings, { teams: ["18"], players: [] }, now);
    const b = item({ title: "Brunson ruled out", type: "injury", playerIds: ["1"], teamIds: ["18"], publishedAt: new Date(now - 600_000).toISOString() });
    const [c2] = clusterItems([a, b], (c) => importanceOf(c, new Set()));
    const e2 = computeEvents([c2], [], settings, { teams: ["18"], players: [] }, now);
    expect(e1.map((e) => e.key)).toHaveLength(1);
    expect(e2[0].key).not.toBe(e1[0].key);
    expect(e2[0].body).toBe("Injury status updated");
  });

  it("keyword alerts and unfollowed low-importance stories", () => {
    const c = clusterItems([item({ title: "Guard signs extension", type: "news", publishedAt: recent })], (x) => importanceOf(x, new Set()));
    const e = computeEvents(c, [], settings, { teams: [], players: [] }, now);
    expect(e.map((x) => x.kind)).toEqual(["keyword"]);
  });

  it("quiet hours wrap past midnight", () => {
    const s = { ...settings, quietStart: 23, quietEnd: 7 };
    expect(inQuietHours(s, new Date(2026, 0, 1, 2))).toBe(true);
    expect(inQuietHours(s, new Date(2026, 0, 1, 12))).toBe(false);
  });
});
