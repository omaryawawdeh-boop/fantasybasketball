"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { usePlayerIndex } from "@/client/data";
import { teamById } from "@/lib/teams";
import { Icon } from "../icons";
import { cx, TimeAgo } from "../ui";

interface Source {
  n: number;
  title: string;
  sourceName: string;
  url: string | null;
  appHref: string | null;
  publishedAt: string | null;
  kind: string;
  dataMode: string;
}

interface Turn {
  q: string;
  answer?: string;
  error?: string;
  setup?: string;
  sources: Source[];
  model?: string;
  pending?: boolean;
}

export function usePageContext(): { kind: "player" | "team" | "game" | "none"; id?: string; label: string | null } {
  const pathname = usePathname();
  const { byId } = usePlayerIndex();
  const m = /^\/(players|teams|games)\/(\d+)/.exec(pathname);
  if (!m) return { kind: "none", label: null };
  const id = m[2];
  if (m[1] === "players") return { kind: "player", id, label: byId.get(id)?.name ?? "this player" };
  if (m[1] === "teams") return { kind: "team", id, label: teamById(id)?.name ?? "this team" };
  return { kind: "game", id, label: "this game" };
}

function suggestions(ctx: ReturnType<typeof usePageContext>): string[] {
  if (ctx.kind === "player") return [`What's the latest on ${ctx.label}?`, `How has ${ctx.label} played over the last 10 games?`, "How does this season compare with career averages?"];
  if (ctx.kind === "team") return [`What's the latest credible news about the ${ctx.label}?`, "Who is injured and when do they play next?", "What are the fantasy implications of their injuries?"];
  if (ctx.kind === "game") return ["Summarize this game", "Who didn't play and why?", "Who were the top performers?"];
  return ["What is the biggest NBA news today?", "Show me the latest updates on injuries to star players", "Summarize the most important NBA stories since yesterday"];
}

/** Turns "[S3]" markers into links to the real source, and light markdown into elements. Never renders HTML. */
function renderAnswer(text: string, sources: Source[]): ReactNode {
  const byN = new Map(sources.map((s) => [`S${s.n}`, s]));
  const inline = (line: string, key: string): ReactNode[] =>
    line.split(/(\[S\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
      const cite = /^\[(S\d+)\]$/.exec(part);
      if (cite) {
        const s = byN.get(cite[1]);
        if (!s) return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
        const label = <sup className="mx-0.5 rounded bg-surface-3 px-1 text-[10px] font-semibold text-text">{cite[1]}</sup>;
        return s.url ? (
          <a key={`${key}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.title} — ${s.sourceName}`}>
            {label}
          </a>
        ) : s.appHref ? (
          <Link key={`${key}-${i}`} href={s.appHref} title={`${s.title} — ${s.sourceName}`}>
            {label}
          </Link>
        ) : (
          <span key={`${key}-${i}`} title={s.title}>
            {label}
          </span>
        );
      }
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      if (bold) return <strong key={`${key}-${i}`}>{bold[1]}</strong>;
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
    });
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return lines.map((l, i) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(l);
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(l);
    if (bullet)
      return (
        <p key={i} className="flex gap-2">
          <span aria-hidden>•</span>
          <span>{inline(bullet[1], `l${i}`)}</span>
        </p>
      );
    if (heading)
      return (
        <p key={i} className="font-semibold">
          {inline(heading[1], `l${i}`)}
        </p>
      );
    return <p key={i}>{inline(l, `l${i}`)}</p>;
  });
}

export function AiChat({ compact }: { compact?: boolean }) {
  const ctx = usePageContext();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [turns]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const history = turns.filter((t) => t.answer).flatMap((t) => [{ role: "user", content: t.q }, { role: "assistant", content: t.answer! }]);
    setTurns((ts) => [...ts, { q: text, sources: [], pending: true }]);
    setQ("");
    const update = (patch: Partial<Turn>) => setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? { ...t, ...patch, pending: false } : t)));
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, context: { kind: ctx.kind, id: ctx.id }, history }),
        signal: ctrl.signal,
      });
      const j = await res.json().catch(() => ({ error: "Unreadable response from the server." }));
      if (j.configured === false) update({ setup: j.reason, sources: j.sources ?? [] });
      else if (j.error) update({ error: j.error, sources: j.sources ?? [] });
      else update({ answer: j.answer, sources: j.sources ?? [], model: `${j.provider} · ${j.model}` });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      update({ error: "Network error — couldn't reach the server." });
    }
  };

  return (
    <div className={cx("flex h-full flex-col", compact ? "" : "min-h-[60vh]")}>
      <div className="flex-1 space-y-5 overflow-y-auto pb-4" aria-live="polite">
        {turns.length === 0 && (
          <div className="text-sm text-muted">
            <p>
              Answers come only from the news, scores, injuries and stats this app has loaded, with numbered citations. If the data isn&apos;t there, the analyst says so.
              {ctx.label && (
                <>
                  {" "}
                  Context: <strong className="text-text">{ctx.label}</strong> — you can ask without repeating the name.
                </>
              )}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {suggestions(ctx).map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-md border border-line px-3 py-2 text-left text-text hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[90%] rounded-lg bg-surface-3 px-3 py-2 text-sm">{t.q}</p>
            {t.pending ? (
              <p className="text-sm text-muted" role="status">
                Retrieving sources and asking the model…
              </p>
            ) : t.setup ? (
              <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
                <p className="font-medium">The AI analyst isn&apos;t set up yet.</p>
                <p className="text-muted">{t.setup}</p>
                <p className="mt-1 text-muted">
                  Free options are listed in the README. Everything else in the app works without it. Below are the sources it would have used.
                </p>
              </div>
            ) : t.error ? (
              <div role="alert" className="rounded-md border border-live/40 bg-live/5 p-3 text-sm">
                {t.error}
              </div>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed">
                {renderAnswer(t.answer ?? "", t.sources)}
                {t.model && <p className="text-[11px] text-faint">AI-generated by {t.model} from the sources below. Check sources before relying on it.</p>}
              </div>
            )}
            {t.sources.length > 0 && (
              <details className="text-xs" open={!!t.setup}>
                <summary className="cursor-pointer text-muted">Sources ({t.sources.length})</summary>
                <ol className="mt-1 space-y-1">
                  {t.sources.map((s) => (
                    <li key={s.n} className="flex gap-2">
                      <span className="tabular w-6 shrink-0 font-semibold text-muted">S{s.n}</span>
                      <span>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                            {s.title}
                          </a>
                        ) : s.appHref ? (
                          <Link href={s.appHref} className="underline">
                            {s.title}
                          </Link>
                        ) : (
                          s.title
                        )}{" "}
                        <span className="text-faint">
                          — {s.sourceName}
                          {s.publishedAt ? (
                            <>
                              , <TimeAgo iso={s.publishedAt} />
                            </>
                          ) : null}
                          {s.dataMode === "demo" ? " (demo data)" : s.dataMode === "cached" ? " (cached)" : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label htmlFor={compact ? "ai-q-panel" : "ai-q"} className="sr-only">
          Ask the AI analyst
        </label>
        <input
          id={compact ? "ai-q-panel" : "ai-q"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={1000}
          placeholder={ctx.label ? `Ask about ${ctx.label}…` : "Ask about the NBA…"}
          className="h-9 flex-1 rounded-md border border-line bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none"
        />
        <button type="submit" disabled={!q.trim()} className="rounded-md bg-accent px-3 text-sm font-medium text-black disabled:opacity-40">
          Ask
        </button>
        {turns.length > 0 && (
          <button type="button" onClick={() => setTurns([])} aria-label="Clear conversation" className="rounded-md border border-line px-2 text-muted hover:text-text">
            <Icon name="refresh" size={16} />
          </button>
        )}
      </form>
    </div>
  );
}
