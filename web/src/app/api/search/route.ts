import type { NextRequest } from "next/server";
import { getFeed, getPlayerIndex } from "@/server/feed";
import { getInjuries, getScoreboard, nbaDay } from "@/server/providers/espn";
import { ok } from "@/server/respond";
import { parseQuery } from "@/lib/nlquery";
import { fuzzyScore } from "@/lib/text";
import { matchesFilter, DEFAULT_FILTER } from "@/lib/rank";
import { TEAMS } from "@/lib/teams";
import { SOURCES } from "@/lib/sources";

// Unified search across players, teams, games, stories, sources and injuries.
// Natural-language phrases become explicit filters (returned as chips); results are always real items.

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) return ok({ query: q, chips: [], compare: null, players: [], teams: [], games: [], stories: [], injuries: [], sources: [] }, []);

  const [idx, feed, inj] = await Promise.all([getPlayerIndex(), getFeed(), getInjuries()]);
  const parsed = parseQuery(q, idx.players.map((p) => ({ id: p.id, name: p.name })));
  // Chips the user removed in the UI: drop those interpreted filters.
  const ignore = new Set((req.nextUrl.searchParams.get("ignore") ?? "").split(",").filter(Boolean));
  for (const key of ignore) {
    if (key === "time") delete parsed.filter.sinceHours;
    else if (key === "verification") delete parsed.filter.verification;
    else if (key === "types") delete parsed.filter.types;
    else if (key.startsWith("team:")) parsed.filter.teamIds = parsed.filter.teamIds?.filter((t) => `team:${t}` !== key);
    else if (key.startsWith("player:")) parsed.filter.playerIds = parsed.filter.playerIds?.filter((t) => `player:${t}` !== key);
  }
  parsed.chips = parsed.chips.filter((c) => !ignore.has(c.key));
  const now = Date.now();

  const players = idx.players
    .map((p) => ({ p, s: (parsed.filter.playerIds?.includes(p.id) ? 10 : 0) + fuzzyScore(q, p.name) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.p);

  const teams = TEAMS.filter((t) => parsed.filter.teamIds?.includes(t.id) || fuzzyScore(q, `${t.name} ${t.abbr} ${t.aliases.join(" ")}`) > 0).slice(0, 6);

  // Stories: apply interpreted filters, then rank by keyword relevance + recency.
  const f = { ...DEFAULT_FILTER, ...parsed.filter };
  const hasStructuredFilter = !!(parsed.filter.types?.length || parsed.filter.teamIds?.length || parsed.filter.playerIds?.length || parsed.filter.sinceHours || parsed.filter.verification);
  const stories = feed.clusters
    .filter((c) => matchesFilter(c, f, now))
    .map((c) => {
      const text = c.items.map((i) => `${i.title} ${i.summary} ${i.sourceName} ${i.byline ?? ""} ${i.citedOrigin ?? ""}`).join(" ");
      const kw = parsed.text ? fuzzyScore(parsed.text, text) : 0;
      return { c, kw, s: kw + c.importance };
    })
    // Leftover words must match; with no leftover words, the interpreted filters alone decide.
    .filter((x) => (parsed.text ? x.kw > 0 : hasStructuredFilter))
    .sort((a, b) => (f.sort === "latest" ? Date.parse(b.c.lastUpdatedAt) - Date.parse(a.c.lastUpdatedAt) : b.s - a.s))
    .slice(0, 30)
    .map((x) => x.c);

  // Games from three days back to three days ahead involving matched teams.
  let games: unknown[] = [];
  const gameTeams = new Set([...(parsed.filter.teamIds ?? []), ...teams.map((t) => t.id)]);
  for (const p of players.slice(0, 2)) gameTeams.add(p.teamId);
  if (gameTeams.size) {
    const days = [-3, -2, -1, 0, 1, 2, 3].map((d) => nbaDay(new Date(now + d * 86_400_000)));
    const boards = await Promise.all(days.map((d) => getScoreboard(d)));
    games = boards
      .flatMap((b) => b.value ?? [])
      .filter((g) => gameTeams.has(g.home.id) || gameTeams.has(g.away.id))
      .slice(0, 12);
  }

  const injuries = (inj.value ?? []).filter(
    (e) => (e.playerId && parsed.filter.playerIds?.includes(e.playerId)) || parsed.filter.teamIds?.includes(e.teamId) || fuzzyScore(q, e.playerName) > 0,
  );

  const sources = SOURCES.filter((s) => fuzzyScore(q, s.name) > 0).map((s) => ({ id: s.id, name: s.name, category: s.category }));

  return ok(
    { query: q, chips: parsed.chips, compare: parsed.compare, players, teams: teams.map((t) => ({ id: t.id, abbr: t.abbr, name: t.name, location: t.location, nickname: t.nickname, color: t.color, altColor: t.altColor, conference: t.conference })), games, stories, injuries, sources },
    feed.meta,
  );
}
