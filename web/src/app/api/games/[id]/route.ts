import { getGame } from "@/server/providers/espn";
import { fail, isId, ok } from "@/server/respond";

export async function GET(_req: Request, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  if (!isId(id)) return fail(400, "invalid game id");
  const r = await getGame(id);
  return ok(r.value, [r.meta]);
}
