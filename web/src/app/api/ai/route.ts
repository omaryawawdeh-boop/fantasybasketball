import { aiConfig, AiError, allowRequest, complete, type ChatTurn } from "@/server/ai";
import { renderSources, retrieve, systemPrompt, type PageContext } from "@/server/retrieve";
import { fail, isId } from "@/server/respond";

export async function POST(req: Request) {
  const cfg = aiConfig();
  let body: { question?: unknown; context?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Request body must be JSON.");
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!question) return fail(400, "Ask a question.");
  const c = (body.context ?? {}) as { kind?: unknown; id?: unknown };
  const ctx: PageContext =
    (c.kind === "player" || c.kind === "team" || c.kind === "game") && typeof c.id === "string" && isId(c.id) ? { kind: c.kind, id: c.id } : { kind: "none" };
  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }))
    : [];

  // Retrieval runs even without a model so the UI can show what the answer would be based on.
  const sources = await retrieve(question, ctx);
  const publicSources = sources.map((s) => ({ n: s.n, title: s.title, sourceName: s.sourceName, url: s.url, appHref: s.appHref, publishedAt: s.publishedAt, kind: s.kind, dataMode: s.dataMode }));
  if (!cfg.ok) return Response.json({ configured: false, reason: cfg.reason, sources: publicSources }, { status: 200 });
  if (!allowRequest()) return fail(429, "Too many questions in the last minute. Wait a moment and try again.");

  const userMsg = `Sources:\n\n${renderSources(sources)}\n\nQuestion: ${question}`;
  try {
    const answer = await complete(cfg.config, systemPrompt(new Date()), [...history, { role: "user", content: userMsg }]);
    // Drop citations to sources that don't exist rather than rendering broken links.
    const valid = new Set(sources.map((s) => `S${s.n}`));
    const cleaned = answer.replace(/\[(S\d+)\]/g, (m, id) => (valid.has(id) ? m : "[source?]"));
    return Response.json({ configured: true, answer: cleaned, sources: publicSources, model: cfg.config.model, provider: cfg.config.provider });
  } catch (e) {
    const msg = e instanceof AiError ? e.message : "Unexpected error while generating the answer.";
    return Response.json({ configured: true, error: msg, sources: publicSources }, { status: 502 });
  }
}
