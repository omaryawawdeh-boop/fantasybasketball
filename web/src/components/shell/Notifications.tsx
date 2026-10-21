"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { computeEvents, inQuietHours } from "@/lib/notify";
import { useFeed, useScoreboard } from "@/client/data";
import { notifStore, usePrefs, useNotifications, type AppNotification } from "@/client/state";
import { Icon } from "../icons";
import { cx, TimeAgo } from "../ui";

// In-app notifications. They are generated in this browser while the app is open, by comparing
// each refresh with what was already seen. No push notifications or background delivery.

/** Runs in the background of the shell; turns data changes into notifications. */
export function NotificationEngine() {
  const { data: feed } = useFeed();
  const { data: sb } = useScoreboard();
  const prefs = usePrefs();

  useEffect(() => {
    if (!feed) return;
    const now = Date.now();
    const events = computeEvents(feed.clusters, sb?.games ?? [], prefs.notifications, { teams: prefs.followedTeams, players: prefs.followedPlayers.map((p) => p.id) }, now);
    notifStore.set((s) => {
      const seen = new Set(s.seen);
      const fresh = events.filter((e) => !seen.has(e.key));
      if (!fresh.length && s.primed) return s;
      for (const e of fresh) seen.add(e.key);
      // First run: everything already on screen counts as seen — don't flood the bell.
      const deliver = s.primed && prefs.notifications.enabled && !inQuietHours(prefs.notifications);
      const items: AppNotification[] = deliver ? fresh.map((e) => ({ ...e, id: `${e.key}:${now}`, read: false })) : [];
      return { primed: true, seen: [...seen].slice(-2000), items: [...items, ...s.items].slice(0, 100) };
    });
  }, [feed, sb, prefs]);

  return null;
}

export function NotificationBell() {
  const st = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = st.items.filter((i) => !i.read).length;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative rounded p-2 text-muted hover:text-text"
      >
        <Icon name="bell" />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-live px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-lg border border-line bg-surface shadow-xl" role="region" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex gap-2 text-xs">
              <button className="text-muted hover:text-text" onClick={() => notifStore.set((s) => ({ ...s, items: s.items.map((i) => ({ ...i, read: true })) }))}>
                Mark all read
              </button>
              <button className="text-muted hover:text-text" onClick={() => notifStore.set((s) => ({ ...s, items: [] }))}>
                Clear
              </button>
            </div>
          </div>
          {st.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              Nothing new. Alerts appear here while the app is open.{" "}
              <Link href="/settings#alerts" className="underline" onClick={() => setOpen(false)}>
                Alert settings
              </Link>
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {st.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={i.href}
                    scroll={false}
                    onClick={() => {
                      notifStore.set((s) => ({ ...s, items: s.items.map((x) => (x.id === i.id ? { ...x, read: true } : x)) }));
                      setOpen(false);
                    }}
                    className={cx("block px-3 py-2 text-sm hover:bg-surface-2", !i.read && "bg-accent-soft")}
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{i.body}</span>
                    <span className="line-clamp-2">{i.title}</span>
                    <span className="text-[11px] text-faint">
                      <TimeAgo iso={i.at} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
