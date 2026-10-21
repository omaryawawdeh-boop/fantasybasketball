import { getStandings } from "@/server/providers/espn";
import { ok } from "@/server/respond";

export async function GET() {
  const r = await getStandings();
  return ok({ standings: r.value }, [r.meta]);
}
