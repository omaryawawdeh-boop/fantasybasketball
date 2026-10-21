import type { NextRequest } from "next/server";
import { getScoreboard, nbaDay } from "@/server/providers/espn";
import { fail, ok } from "@/server/respond";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? nbaDay(new Date());
  if (!/^\d{8}$/.test(date)) return fail(400, "date must be YYYYMMDD");
  const r = await getScoreboard(date);
  return ok({ date, games: r.value }, [r.meta]);
}
