import { getFeed } from "@/server/feed";
import { ok } from "@/server/respond";

export async function GET() {
  const { clusters, meta } = await getFeed();
  return ok({ clusters }, meta);
}
