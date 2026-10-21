import { getInjuries, getRoster, getSchedule, getStandings } from "@/server/providers/espn";
import { teamById } from "@/lib/teams";
import { fail, ok } from "@/server/respond";

export async function GET(_req: Request, ctx: RouteContext<"/api/teams/[id]">) {
  const { id } = await ctx.params;
  const team = teamById(id);
  if (!team) return fail(404, "unknown team");
  const [roster, schedule, standings, inj] = await Promise.all([getRoster(id), getSchedule(id), getStandings(), getInjuries()]);
  return ok(
    {
      roster: roster.value,
      schedule: schedule.value,
      standing: standings.value?.find((r) => r.team.id === id) ?? null,
      injuries: inj.value?.filter((e) => e.teamId === id) ?? null,
    },
    [roster.meta, schedule.meta, standings.meta, inj.meta],
  );
}
