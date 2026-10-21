"use client";

import { useState } from "react";
import { CONTENT_TYPES, type ContentType } from "@/lib/types";
import { SOURCES, CATEGORY_LABEL } from "@/lib/sources";
import { useApi } from "@/client/api";
import { prefsStore, resetPersonalization, updatePrefs, usePrefs, type NotifPrefs } from "@/client/state";
import { Icon } from "@/components/icons";
import { absTime, Card, Chip, cx, SectionHeader, Toggle } from "@/components/ui";

interface Status {
  dataMode: string;
  ai: { configured: true; provider: string; model: string } | { configured: false; reason: string };
  youtubeApiKey: boolean;
  feeds: { id: string; name: string; category: string; url: string; notes: string }[];
  providers: { provider: string; lastSuccess: string | null; lastError: string | null; lastErrorAt: string | null; lastMode: string | null; requests: number; failures: number }[];
  serverTime: string;
}

export default function SettingsPage() {
  const prefs = usePrefs();
  const n = prefs.notifications;
  const setN = (patch: Partial<NotifPrefs>) => updatePrefs((p) => ({ notifications: { ...p.notifications, ...patch } }));
  const [kw, setKw] = useState("");
  const [mute, setMute] = useState("");
  const status = useApi<Status>("/api/status", { refreshInterval: 30_000 });

  const toggleIn = (key: "preferredTypes" | "mutedTypes", t: ContentType) =>
    updatePrefs((p) => ({ [key]: p[key].includes(t) ? p[key].filter((x) => x !== t) : [...p[key], t] }));

  return (
    <div className="space-y-6">
      <SectionHeader as="h1" title="Settings & data sources" />
      {!prefsStore.persistent() && (
        <p role="alert" className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Local storage is unavailable in this browser, so settings will reset when the tab closes.
        </p>
      )}

      <Card className="p-4">
        <SectionHeader title="Appearance & privacy" />
        <Toggle label="Light theme" checked={prefs.theme === "light"} onChange={(v) => updatePrefs({ theme: v ? "light" : "dark" })} />
        <Toggle
          label="Show publisher images (news photos, player headshots)"
          help="Off by default: those images belong to the publishers and loading them tells their servers you're reading. YouTube thumbnails are always shown with videos."
          checked={prefs.publisherImages}
          onChange={(v) => updatePrefs({ publisherImages: v })}
        />
        <p className="mt-1 text-xs text-faint">Motion: animations follow your operating system&apos;s reduced-motion setting.</p>
      </Card>

      <Card className="p-4">
        <SectionHeader
          title="Personalization"
          right={
            <button
              onClick={() => confirm("Reset follows, preferred and muted categories, muted keywords, hidden sources and saved searches?") && resetPersonalization()}
              className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text"
            >
              Reset personalization
            </button>
          }
        />
        <p className="mb-3 text-sm text-muted">
          The feed learns only from what you choose here and from what you follow or save — never from reading time. Ranking works without any of it.
        </p>
        <h3 className="mb-1 text-xs font-semibold text-muted">Boost these categories</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CONTENT_TYPES.map((t) => (
            <Chip key={t.id} active={prefs.preferredTypes.includes(t.id)} onClick={() => toggleIn("preferredTypes", t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <h3 className="mb-1 text-xs font-semibold text-muted">Hide these categories</h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CONTENT_TYPES.map((t) => (
            <Chip key={t.id} active={prefs.mutedTypes.includes(t.id)} onClick={() => toggleIn("mutedTypes", t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <h3 className="mb-1 text-xs font-semibold text-muted">Muted words or topics</h3>
        <form
          className="mb-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mute.trim()) updatePrefs((p) => ({ mutedKeywords: [...new Set([...p.mutedKeywords, mute.trim()])] }));
            setMute("");
          }}
        >
          <label htmlFor="mute" className="sr-only">Add muted word</label>
          <input id="mute" value={mute} onChange={(e) => setMute(e.target.value)} placeholder="e.g. power rankings" className="h-8 flex-1 rounded border border-line bg-surface-2 px-2 text-sm" />
          <button className="rounded border border-line px-3 text-sm">Mute</button>
        </form>
        <ChipList items={prefs.mutedKeywords} onRemove={(k) => updatePrefs((p) => ({ mutedKeywords: p.mutedKeywords.filter((x) => x !== k) }))} empty="No muted words." />
        <h3 className="mb-1 mt-3 text-xs font-semibold text-muted">Hidden sources</h3>
        <ChipList
          items={prefs.hiddenSources}
          label={(id) => SOURCES.find((s) => s.id === id)?.name ?? id}
          onRemove={(k) => updatePrefs((p) => ({ hiddenSources: p.hiddenSources.filter((x) => x !== k) }))}
          empty="No hidden sources. Hide one from any story's ⋯ menu."
        />
      </Card>

      <Card className="p-4" >
        <div id="alerts" className="scroll-mt-20" />
        <SectionHeader title="Alerts" />
        <p className="mb-2 text-sm text-muted">
          Alerts appear in the bell menu <strong>while this app is open</strong> in a tab. Browser push and phone notifications are not implemented (they would need a
          background server and a push service). Each underlying event alerts once.
        </p>
        <Toggle label="Enable alerts" checked={n.enabled} onChange={(v) => setN({ enabled: v })} />
        <div className={cx("divide-y divide-line border-t border-line", !n.enabled && "pointer-events-none opacity-50")}>
          <Toggle label="Breaking news" help="Important, recent, non-rumor stories" checked={n.breaking} onChange={(v) => setN({ breaking: v })} />
          <Toggle label="Major injury updates" help="Followed players/teams, or high-importance injuries" checked={n.injuries} onChange={(v) => setN({ injuries: v })} />
          <Toggle label="Starting lineup changes" checked={n.lineups} onChange={(v) => setN({ lineups: v })} />
          <Toggle label="Transactions" checked={n.transactions} onChange={(v) => setN({ transactions: v })} />
          <Toggle label="Game starts (followed teams)" checked={n.gameStart} onChange={(v) => setN({ gameStart: v })} />
          <Toggle label="Final scores (followed teams)" checked={n.finals} onChange={(v) => setN({ finals: v })} />
          <Toggle label="Fantasy-relevant updates (watchlist)" checked={n.fantasy} onChange={(v) => setN({ fantasy: v })} />
          <Toggle label="Only followed players & teams" help="Breaking news still comes through" checked={n.followedOnly} onChange={(v) => setN({ followedOnly: v })} />
          <div className="py-2">
            <p className="text-sm">Keywords</p>
            <form
              className="my-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (kw.trim()) setN({ keywords: [...new Set([...n.keywords, kw.trim()])] });
                setKw("");
              }}
            >
              <label htmlFor="kw" className="sr-only">Add alert keyword</label>
              <input id="kw" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="e.g. extension" className="h-8 flex-1 rounded border border-line bg-surface-2 px-2 text-sm" />
              <button className="rounded border border-line px-3 text-sm">Add</button>
            </form>
            <ChipList items={n.keywords} onRemove={(k) => setN({ keywords: n.keywords.filter((x) => x !== k) })} empty="No keyword alerts." />
          </div>
          <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span>Quiet hours</span>
            <select aria-label="Quiet hours start" value={n.quietStart ?? ""} onChange={(e) => setN({ quietStart: e.target.value === "" ? null : Number(e.target.value) })} className="rounded border border-line bg-surface-2 px-2 py-1">
              <option value="">Off</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </select>
            <span>to</span>
            <select aria-label="Quiet hours end" value={n.quietEnd ?? ""} onChange={(e) => setN({ quietEnd: e.target.value === "" ? null : Number(e.target.value) })} className="rounded border border-line bg-surface-2 px-2 py-1">
              <option value="">Off</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </select>
            <span className="text-xs text-faint">Events during quiet hours are skipped, not queued.</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div id="sources" className="scroll-mt-20" />
        <SectionHeader title="Data sources" right={<button onClick={() => status.mutate()} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"><Icon name="refresh" size={12} /> Refresh</button>} />
        {status.error ? (
          <p className="text-sm text-live">Couldn&apos;t load status: {status.error.message}</p>
        ) : !status.data ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <p>
              Data mode: <strong>{status.data.dataMode}</strong>{" "}
              <span className="text-muted">
                {status.data.dataMode === "auto"
                  ? "— live sources; if a source has never worked since the server started, labeled demo data fills in."
                  : status.data.dataMode === "demo"
                    ? "— fictional demo data only."
                    : "— live only; failures show as unavailable."}
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="mb-1 text-left text-muted">What has actually happened since the server started (server time {absTime(status.data.serverTime)})</caption>
                <thead className="text-faint">
                  <tr>
                    {["Provider", "State", "Last success", "Last error", "Requests", "Failures"].map((h) => (
                      <th key={h} scope="col" className="px-2 py-1 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.data.providers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-2 text-muted">No requests yet — open the home page first.</td>
                    </tr>
                  ) : (
                    status.data.providers.map((p) => (
                      <tr key={p.provider} className="border-t border-line">
                        <td className="px-2 py-1 font-medium">{p.provider}</td>
                        <td className={cx("px-2", p.lastMode === "live" ? "text-ok" : p.lastMode === "cached" ? "text-warn" : p.lastMode === "demo" ? "text-demo" : "text-live")}>{p.lastMode ?? "—"}</td>
                        <td className="px-2">{p.lastSuccess ? absTime(p.lastSuccess) : "never"}</td>
                        <td className="max-w-xs px-2 text-muted">{p.lastError ? `${p.lastError} (${absTime(p.lastErrorAt)})` : "—"}</td>
                        <td className="tabular px-2">{p.requests}</td>
                        <td className="tabular px-2">{p.failures}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">News & video feeds</h3>
              <ul className="space-y-1 text-xs">
                <li>
                  <strong>ESPN site API</strong> — scores, box scores, rosters, schedules, standings, injuries, news, player stats. {SOURCES[0].notes}
                </li>
                {status.data.feeds.map((f) => (
                  <li key={f.id}>
                    <strong>{f.name}</strong> <span className="text-faint">({CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category})</span> — {f.notes}{" "}
                    <span className="break-all text-faint">{f.url}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">AI analyst</h3>
              {status.data.ai.configured ? (
                <p>
                  Configured: <strong>{status.data.ai.provider}</strong> · {status.data.ai.model}. Your questions plus the retrieved source snippets are sent to this provider.
                </p>
              ) : (
                <p className="text-muted">Not configured: {status.data.ai.reason}</p>
              )}
              <p className="mt-1 text-xs text-muted">YouTube Data API key: {status.data.youtubeApiKey ? "set (embeddability checks on)" : "not set (optional)"}</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Privacy</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
                <li>No accounts, analytics, ads or tracking. Follows, saves and settings stay in this browser&apos;s local storage.</li>
                <li>Data sources are contacted by your server, not your browser — they see the server&apos;s IP, not your reading.</li>
                <li>Pressing play on a video loads YouTube&apos;s privacy-enhanced player (youtube-nocookie.com); nothing loads before you press play.</li>
                <li>AI questions go to the configured AI provider only.</li>
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader title="Your local data" />
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => {
              const dump: Record<string, unknown> = {};
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i)!;
                  if (k.startsWith("hw.")) dump[k] = JSON.parse(localStorage.getItem(k) ?? "null");
                }
              } catch {
                /* storage unavailable */
              }
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" }));
              a.download = "hardwood-wire-data.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded border border-line px-3 py-1.5 hover:bg-surface-2"
          >
            Download my data
          </button>
          <button
            onClick={() => {
              if (!confirm("Delete all saved stories, follows, settings, alerts and injury history from this browser?")) return;
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("hw."))
                  .forEach((k) => localStorage.removeItem(k));
              } catch {
                /* storage unavailable */
              }
              location.reload();
            }}
            className="rounded border border-live/50 px-3 py-1.5 text-live hover:bg-live/10"
          >
            Delete all local data
          </button>
        </div>
      </Card>
    </div>
  );
}

function ChipList({ items, onRemove, empty, label = (s: string) => s }: { items: string[]; onRemove: (s: string) => void; empty: string; label?: (s: string) => string }) {
  if (!items.length) return <p className="text-xs text-faint">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <button key={k} onClick={() => onRemove(k)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs hover:bg-surface-3" aria-label={`Remove ${label(k)}`}>
          {label(k)} <Icon name="x" size={12} />
        </button>
      ))}
    </div>
  );
}
