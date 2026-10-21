import { dataMode, providerStatuses } from "@/server/fetcher";
import { aiConfig } from "@/server/ai";
import { feedSources } from "@/server/providers/feeds";
import { ok } from "@/server/respond";

// Reports what is configured and what has actually worked in this server process.
// Never includes keys — only whether they are set.
export async function GET() {
  const ai = aiConfig();
  return ok(
    {
      dataMode: dataMode(),
      ai: ai.ok ? { configured: true, provider: ai.config.provider, model: ai.config.model } : { configured: false, reason: ai.reason },
      youtubeApiKey: Boolean(process.env.YOUTUBE_API_KEY),
      feeds: feedSources().map((s) => ({ id: s.id, name: s.name, category: s.category, url: s.url, notes: s.notes })),
      providers: providerStatuses(),
      serverTime: new Date().toISOString(),
    },
    [],
  );
}
