"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ContentType, DataMode, SourceMeta, Verification } from "@/lib/types";
import { contrastText, teamById } from "@/lib/teams";
import { VERIFICATION_HELP, VERIFICATION_LABEL } from "@/lib/classify";
import { CONTENT_TYPES } from "@/lib/types";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- time ----------

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "unknown time";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown time";
  const s = Math.round((now - t) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? "just now" : a < 3600 ? `${Math.floor(a / 60)}m` : a < 86400 ? `${Math.floor(a / 3600)}h` : a < 86400 * 7 ? `${Math.floor(a / 86400)}d` : null;
  if (v === "just now") return v;
  if (v) return future ? `in ${v}` : `${v} ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

export function absTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function TimeAgo({ iso, prefix }: { iso: string | null | undefined; prefix?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso ?? undefined} title={absTime(iso)} className="tabular">
      {prefix}
      {relTime(iso, now)}
    </time>
  );
}

// ---------- badges ----------

export function TeamBadge({ id, abbr, size = "sm" }: { id?: string | null; abbr?: string; size?: "sm" | "md" | "lg" }) {
  const t = teamById(id ?? undefined);
  const label = t?.abbr ?? abbr ?? "?";
  const bg = t?.color ?? "var(--surface-3)";
  const dims = size === "lg" ? "h-12 min-w-12 text-base" : size === "md" ? "h-8 min-w-8 text-xs" : "h-5 min-w-7 text-[10px]";
  return (
    <span
      className={cx("inline-flex items-center justify-center rounded px-1 font-bold tracking-wide", dims)}
      style={{ background: bg, color: t ? contrastText(t.color) : "var(--text)" }}
      aria-hidden
    >
      {label}
    </span>
  );
}

export function TeamLink({ id, showName = false, className }: { id: string; showName?: boolean; className?: string }) {
  const t = teamById(id);
  if (!t) return null;
  return (
    <Link href={`/teams/${t.id}`} className={cx("inline-flex items-center gap-1.5 hover:underline", className)} aria-label={t.name}>
      <TeamBadge id={t.id} />
      {showName && <span>{t.name}</span>}
    </Link>
  );
}

const VERIF_STYLE: Record<Verification, string> = {
  official: "text-ok border-ok/40 bg-ok/10",
  reported: "text-info border-info/40 bg-info/10",
  unconfirmed: "text-muted border-line bg-surface-2",
  rumor: "text-warn border-warn/40 bg-warn/10",
};

export function VerificationBadge({ v }: { v: Verification }) {
  return (
    <span title={VERIFICATION_HELP[v]} className={cx("inline-flex items-center rounded border px-1.5 py-px text-[11px] font-semibold", VERIF_STYLE[v])}>
      {VERIFICATION_LABEL[v]}
    </span>
  );
}

const TYPE_LABEL = Object.fromEntries(CONTENT_TYPES.map((t) => [t.id, t.label])) as Record<ContentType, string>;
export const typeLabel = (t: ContentType) => (t === "news" ? "News" : TYPE_LABEL[t]);

export function TypeBadge({ t }: { t: ContentType }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{typeLabel(t)}</span>;
}

export function DemoBadge() {
  return (
    <span title="Fictional demonstration data — not real news or stats." className="rounded border border-demo/50 bg-demo/10 px-1.5 py-px text-[11px] font-bold uppercase tracking-wider text-demo">
      Demo
    </span>
  );
}

const MODE_LABEL: Record<DataMode, string> = { live: "Live", cached: "Cached", demo: "Demo data", unavailable: "Unavailable" };
const MODE_STYLE: Record<DataMode, string> = { live: "text-ok", cached: "text-warn", demo: "text-demo", unavailable: "text-live" };

/** Compact data-freshness indicator for a section. Shows the worst mode among its sources. */
export function DataStatus({ meta, className }: { meta: SourceMeta[]; className?: string }) {
  const now = useNow();
  if (!meta.length) return null;
  const order: DataMode[] = ["unavailable", "demo", "cached", "live"];
  const worst = order.find((m) => meta.some((x) => x.mode === m)) ?? "live";
  const latest = meta.map((m) => m.fetchedAt).filter(Boolean).sort().pop();
  const errors = meta.filter((m) => m.error && m.mode !== "live");
  return (
    <span
      className={cx("inline-flex items-center gap-1 text-[11px]", MODE_STYLE[worst], className)}
      title={[
        ...meta.map((m) => `${m.provider}: ${MODE_LABEL[m.mode]}${m.fetchedAt ? ` (updated ${absTime(m.fetchedAt)})` : ""}${m.error ? ` — ${m.error}` : ""}`),
      ].join("\n")}
    >
      <span className={cx("inline-block h-1.5 w-1.5 rounded-full", worst === "live" ? "bg-ok" : worst === "cached" ? "bg-warn" : worst === "demo" ? "bg-demo" : "bg-live")} />
      {MODE_LABEL[worst]}
      {worst !== "demo" && latest ? <span className="text-faint">· {relTime(latest, now)}</span> : null}
      {errors.length > 0 && worst === "cached" ? <span className="text-faint">· source failing</span> : null}
    </span>
  );
}

export function DemoNotice({ meta }: { meta: SourceMeta[] }) {
  if (!meta.some((m) => m.mode === "demo")) return null;
  return (
    <div role="note" className="mb-3 flex items-start gap-2 rounded-md border border-demo/40 bg-demo/10 px-3 py-2 text-sm text-text">
      <Icon name="info" className="mt-0.5 shrink-0 text-demo" />
      <p>
        <strong className="text-demo">Demonstration data.</strong> The live source couldn&apos;t be reached, so this section shows fictional sample content (invented players, &quot;Demo —&quot;
        headlines). It is not real news or real statistics. See <Link className="underline" href="/settings#sources">Settings → Data sources</Link>.
      </p>
    </div>
  );
}

// ---------- states ----------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-2", className)} aria-hidden />;
}

export function LoadingList({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, icon = "info" }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <Icon name={icon} size={22} className="mb-2 text-faint" />
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, what = "this data" }: { error: Error; onRetry?: () => void; what?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-live/40 bg-live/5 px-4 py-3 text-sm">
      <p className="font-medium">Couldn&apos;t load {what}.</p>
      <p className="text-muted">{error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs hover:bg-surface-2">
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, right, as: H = "h2" }: { title: ReactNode; right?: ReactNode; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <H className={cx("font-semibold tracking-tight", H === "h1" ? "text-xl" : "text-base")}>{title}</H>
      {right}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)}>{children}</section>;
}

export function Chip({ active, onClick, children, label }: { active?: boolean; onClick?: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cx(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:border-faint hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="text-sm">{label}</span>
        {help && <span className="block text-xs text-muted">{help}</span>}
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** An image that disappears instead of showing a broken icon. Lazy-loaded. */
export function SafeImg({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} onError={() => setFailed(true)} />;
}
