import { getPlayerIndex } from "@/server/feed";
import { ok } from "@/server/respond";

export async function GET() {
  const { players, meta } = await getPlayerIndex();
  const worst = meta.find((m) => m.mode === "unavailable") ?? meta.find((m) => m.mode === "demo") ?? meta[0];
  return ok({ players }, worst ? [{ ...worst, provider: "espn-roster" }] : []);
}
