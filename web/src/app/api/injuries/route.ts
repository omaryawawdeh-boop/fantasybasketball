import { getInjuries } from "@/server/providers/espn";
import { ok } from "@/server/respond";

export async function GET() {
  const r = await getInjuries();
  return ok({ injuries: r.value }, [r.meta]);
}
