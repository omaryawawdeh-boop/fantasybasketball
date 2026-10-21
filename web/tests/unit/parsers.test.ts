import { describe, expect, it } from "vitest";
import { parseAthlete, parseCareer, parseGameLog, parseInjuries, parseNews, parseRoster, parseSchedule, parseScoreboard, parseStandings, parseSummary } from "@/server/providers/espn";
import { parseRss } from "@/server/providers/feeds";
import { SOURCES } from "@/lib/sources";
import { FIXTURES } from "@/server/fixtures/data";
import { resolvePlaceholders } from "@/server/fixtures/index";

const fx = (k: string) => resolvePlaceholders(FIXTURES[k], new Date("2026-10-21T18:00:00Z"));
const src = (id: string) => SOURCES.find((s) => s.id === id)!;

describe("ESPN scoreboard", () => {
  it("parses games with correct states; scheduled games never get scores", () => {
    const games = parseScoreboard(fx("espn-scoreboard-d0"));
    expect(games.length).toBe(3);
    const live = games.find((g) => g.state === "in")!;
    expect(live.home.score).toBeGreaterThan(0);
    expect(live.period).toBe(3);
    for (const g of games.filter((x) => x.state === "pre")) {
      expect(g.home.score).toBeNull();
      expect(g.away.score).toBeNull();
      expect(g.clock).toBeNull();
    }
  });

  it("maps ESPN abbreviations to our team ids (NY → NYK)", () => {
    const games = parseScoreboard(fx("espn-scoreboard-d0"));
    const all = games.flatMap((g) => [g.home, g.away]);
    expect(all.find((t) => t.id === "18")?.abbr).toBe("NYK");
  });

  it("rejects malformed JSON and wrong shapes", () => {
    expect(() => parseScoreboard("{not json")).toThrow(/JSON/);
    expect(() => parseScoreboard(JSON.stringify({ foo: 1 }))).toThrow(/events/);
  });

  it("drops a malformed event without breaking the rest", () => {
    const good = JSON.parse(fx("espn-scoreboard-d0")).events[0];
    const games = parseScoreboard(JSON.stringify({ events: [good, { id: "x" }, null, { competitions: "nope" }] }));
    expect(games).toHaveLength(1);
  });

  it("postponed games are labeled postponed, not upcoming", () => {
    const ev = JSON.parse(fx("espn-scoreboard-d1")).events[0];
    ev.competitions[0].status = { type: { name: "STATUS_POSTPONED", state: "pre", shortDetail: "Postponed" } };
    expect(parseScoreboard(JSON.stringify({ events: [ev] }))[0].state).toBe("postponed");
  });
});

describe("ESPN other endpoints", () => {
  it("box score marks starters and DNPs", () => {
    const key = Object.keys(FIXTURES).find((k) => k.startsWith("espn-summary-"))!;
    const d = parseSummary(fx(key));
    expect(d.box).toHaveLength(2);
    expect(d.box[0].labels).toContain("PTS");
    expect(d.startersConfirmed).toBe(true);
    expect(d.box.flatMap((b) => b.players).some((p) => p.starter)).toBe(true);
  });

  it("injuries: status, team, and athlete id from the profile link", () => {
    const list = parseInjuries(fx("espn-injuries"));
    const v = list.find((e) => e.playerName === "Darius Vantrell")!;
    expect(v.status).toBe("Out");
    expect(v.teamAbbr).toBe("NYK");
    expect(v.playerId).toBe("9001");
    expect(v.official).toBe(false);
    expect(list.every((e) => e.sourceName === "ESPN injury feed")).toBe(true);
  });

  it("roster, schedule, standings, athlete, game log, career", () => {
    expect(parseRoster(fx("espn-roster-18"), "18").length).toBe(7);
    const sched = parseSchedule(fx("espn-schedule-18"), "18");
    expect(sched.length).toBeGreaterThan(3);
    expect(sched.filter((g) => g.state === "post").every((g) => g.result === "W" || g.result === "L")).toBe(true);
    expect(parseStandings(fx("espn-standings")).length).toBe(6);
    expect(parseAthlete(fx("espn-athlete-9001")).team?.abbr).toBe("NYK");
    const log = parseGameLog(fx("espn-gamelog-9008"));
    expect(log.length).toBeGreaterThan(3);
    expect(log[0].pts).toBe(2 * log[0].fgm + log[0].tpm + log[0].ftm);
    // newest first
    expect(Date.parse(log[0].date)).toBeGreaterThanOrEqual(Date.parse(log[log.length - 1].date));
    const career = parseCareer(fx("espn-career-9001"));
    expect(career[0].stats.fgPct!).toBeLessThanOrEqual(1);
  });

  it("game log without a PTS column is rejected rather than misread", () => {
    expect(() => parseGameLog(JSON.stringify({ labels: ["MIN"], events: {}, seasonTypes: [] }))).toThrow(/PTS/);
  });

  it("news items keep ESPN categories, source and real timestamps; demo is labeled", () => {
    const items = parseNews(fx("espn-news"), null, "demo");
    expect(items.length).toBeGreaterThan(5);
    expect(items.every((i) => i.sourceCategory === "national" && i.provenance.mode === "demo")).toBe(true);
    const inj = items.find((i) => /rule out/.test(i.title))!;
    expect(inj.playerIds).toContain("9001");
    expect(inj.verification).toBe("official");
    const live = parseNews(fx("espn-news"), "2026-10-21T00:00:00Z", "live");
    expect(live[0].sourceCategory).toBe("national");
  });

  it("news drops items with no headline or no publish time (never invents them)", () => {
    const items = parseNews(JSON.stringify({ articles: [{ headline: "No time" }, { published: "2026-10-01T00:00:00Z" }, { headline: "Ok", published: "2026-10-01T00:00:00Z" }] }), null);
    expect(items.map((i) => i.title)).toEqual(["Ok"]);
  });
});

describe("RSS / Atom", () => {
  it("parses RSS, strips HTML, keeps NBA-only items", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Knicks <b>win</b></title><link>https://www.cbssports.com/a</link><description><![CDATA[<p>Big night</p>]]></description><pubDate>Tue, 20 Oct 2026 23:00:00 GMT</pubDate></item>
      <item><title>NFL Week 7 picks</title><link>https://www.cbssports.com/b</link><pubDate>Tue, 20 Oct 2026 23:00:00 GMT</pubDate></item>
      <item><title>No date Knicks</title><link>https://www.cbssports.com/c</link></item>
    </channel></rss>`;
    const items = parseRss(xml, src("cbs"), "live", null);
    expect(items.map((i) => i.title)).toEqual(["Knicks win"]);
    expect(items[0].summary).toBe("Big night");
  });

  it("decodes entity-escaped HTML descriptions to plain text", () => {
    const xml = `<rss><channel><item><title>Celtics &amp; Knicks</title><link>https://x.com/a</link><description>&lt;p&gt;Hello &lt;b&gt;there&lt;/b&gt;&lt;/p&gt;</description><pubDate>Tue, 20 Oct 2026 23:00:00 GMT</pubDate></item></channel></rss>`;
    const [i] = parseRss(xml, src("cbs"), "live", null);
    expect(i.title).toBe("Celtics & Knicks");
    expect(i.summary).toBe("Hello there");
  });

  it("rejects javascript: links", () => {
    const xml = `<rss><channel><item><title>Knicks news</title><link>javascript:alert(1)</link><pubDate>Tue, 20 Oct 2026 23:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseRss(xml, src("cbs"), "live", null)[0].url).toBeNull();
  });

  it("non-feed XML is an error", () => {
    expect(() => parseRss("<html><body>blocked</body></html>", src("cbs"), "live", null)).toThrow();
  });

  it("YouTube Atom → embeddable video items; demo items have no fake player", () => {
    const xml = `<feed xmlns:yt="x" xmlns:media="y"><entry><yt:videoId>abcDEF12345</yt:videoId><title>Top 10 plays</title><published>2026-10-20T10:00:00Z</published></entry></feed>`;
    const [v] = parseRss(xml, src("yt-nba"), "live", null);
    expect(v.playback).toEqual({ kind: "youtube", videoId: "abcDEF12345", embeddable: null });
    expect(v.type).toBe("highlight");
    expect(v.verification).toBe("official");
    const demo = parseRss(fx("rss-yt-nba"), src("yt-nba"), "demo", null);
    expect(demo.every((d) => d.playback?.kind === "none")).toBe(true);
  });

  it("rejects suspicious video ids", () => {
    const xml = `<feed><entry><yt:videoId>"><script></yt:videoId><title>x</title><published>2026-10-20T10:00:00Z</published></entry></feed>`;
    expect(parseRss(xml, src("yt-nba"), "live", null)).toHaveLength(0);
  });
});
