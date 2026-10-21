import type { NextRequest } from "next/server";
import { getAthlete, getInjuries, getPlayerStats, getSchedule } from "@/server/providers/espn";
import { espnSeasonYear } from "@/lib/stats";
import { fail, isId, ok } from "@/server/respond";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/players/[id]">) {
  const { id } = await ctx.params;
  if (!isId(id)) return fail(400, "invalid player id");
  const current = espnSeasonYear(new Date());
  const season = Number(req.nextUrl.searchParams.get("season") ?? current);
  if (!Number.isInteger(season) || season < 1950 || season > current) return fail(400, "invalid season");
  const [bio, stats, inj] = await Promise.all([getAthlete(id), getPlayerStats(id, season), getInjuries()]);
  const teamId = bio.value?.team?.id;
  const sched = teamId ? await getSchedule(teamId) : null;
  const injury = inj.value?.find((e) => e.playerId === id) ?? null;
  return ok(
    { bio: bio.value, stats: stats.value, injury, schedule: sched?.value ?? null, season, currentSeason: current },
    [bio.meta, ...stats.meta, inj.meta, ...(sched ? [sched.meta] : [])],
  );
}
