"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { updatePrefs, usePrefs } from "@/client/state";
import { teamById } from "@/lib/teams";
import { Icon } from "../icons";
import { cx, TeamBadge } from "../ui";
import { MOBILE_NAV, NAV, isActive } from "./nav";
import { RightRail } from "./RightRail";
import { NotificationBell, NotificationEngine } from "./Notifications";
import { AiPanel } from "../ai/AiPanel";
import { StoryDialog } from "../feed/StoryDialog";
import { InjuryHistoryRecorder } from "../injuries/InjuryHistoryRecorder";

export const APP_NAME = "Hardwood Wire";

export function AppShell({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const showRight = !prefs.rightCollapsed && !pathname.startsWith("/ai");

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar onAi={() => setAiOpen((v) => !v)} aiOpen={aiOpen} onMenu={() => setMenuOpen(true)} />
      <div className="mx-auto flex max-w-[1440px] gap-6 px-0 md:px-4">
        <LeftNav collapsed={prefs.leftCollapsed} />
        <main id="main" className="min-w-0 flex-1 px-3 pb-24 pt-4 md:px-0 lg:pb-10">
          {children}
        </main>
        {showRight && (
          <aside aria-label="Games, injuries and trending" className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-80 shrink-0 overflow-y-auto py-4 xl:block">
            <RightRail />
          </aside>
        )}
      </div>
      <MobileNav onMenu={() => setMenuOpen(true)} />
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      <StoryDialog />
      <NotificationEngine />
      <InjuryHistoryRecorder />
    </div>
  );
}

function TopBar({ onAi, aiOpen, onMenu }: { onAi: () => void; aiOpen: boolean; onMenu: () => void }) {
  const prefs = usePrefs();
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, like most reading apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 md:px-4">
        <button className="rounded p-2 text-muted hover:text-text lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Icon name="panel" />
        </button>
        <button
          className="hidden rounded p-2 text-muted hover:text-text lg:block"
          onClick={() => updatePrefs((p) => ({ leftCollapsed: !p.leftCollapsed }))}
          aria-label={prefs.leftCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-pressed={!prefs.leftCollapsed}
        >
          <Icon name="panel" />
        </button>
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded bg-accent text-[13px] font-black text-black">
            HW
          </span>
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search players, teams, stories…  (press /)"
            aria-label="Search"
            className="h-9 w-full max-w-xl rounded-md border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </form>
        <NotificationBell />
        <button
          onClick={onAi}
          aria-pressed={aiOpen}
          className={cx("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm", aiOpen ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}
        >
          <Icon name="sparkles" size={16} />
          <span className="hidden sm:inline">Ask</span>
        </button>
        <button
          className="rounded p-2 text-muted hover:text-text"
          onClick={() => updatePrefs((p) => ({ theme: p.theme === "dark" ? "light" : "dark" }))}
          aria-label={`Switch to ${prefs.theme === "dark" ? "light" : "dark"} theme`}
        >
          <Icon name={prefs.theme === "dark" ? "sun" : "moon"} />
        </button>
        <button
          className="hidden rounded p-2 text-muted hover:text-text xl:block"
          onClick={() => updatePrefs((p) => ({ rightCollapsed: !p.rightCollapsed }))}
          aria-label={prefs.rightCollapsed ? "Show right sidebar" : "Hide right sidebar"}
          aria-pressed={!prefs.rightCollapsed}
        >
          <Icon name="panel" style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>
    </header>
  );
}

function NavLinks({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              title={compact ? n.label : undefined}
              className={cx(
                "flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm",
                active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface hover:text-text",
              )}
            >
              <Icon name={n.icon} />
              {compact ? <span className="sr-only">{n.label}</span> : n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Watchlists() {
  const prefs = usePrefs();
  return (
    <>
      <div className="mt-5">
        <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Followed teams</h3>
        {prefs.followedTeams.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-faint">Follow teams from any team page.</p>
        ) : (
          <ul className="mt-1">
            {prefs.followedTeams.map((id) => {
              const t = teamById(id);
              return t ? (
                <li key={id}>
                  <Link href={`/teams/${id}`} className="flex items-center gap-2 rounded px-2.5 py-1 text-sm text-muted hover:bg-surface hover:text-text">
                    <TeamBadge id={id} /> {t.nickname}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </div>
      <div className="mt-4">
        <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Player watchlist</h3>
        {prefs.followedPlayers.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-faint">Follow players from their profiles.</p>
        ) : (
          <ul className="mt-1">
            {prefs.followedPlayers.map((p) => (
              <li key={p.id}>
                <Link href={`/players/${p.id}`} className="flex items-center gap-2 rounded px-2.5 py-1 text-sm text-muted hover:bg-surface hover:text-text">
                  <TeamBadge id={p.teamId} /> <span className="truncate">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {prefs.savedSearches.length > 0 && (
        <div className="mt-4">
          <h3 className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Saved searches</h3>
          <ul className="mt-1">
            {prefs.savedSearches.map((s) => (
              <li key={s}>
                <Link href={`/search?q=${encodeURIComponent(s)}`} className="block truncate rounded px-2.5 py-1 text-sm text-muted hover:bg-surface hover:text-text">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LeftNav({ collapsed }: { collapsed: boolean }) {
  return (
    <nav aria-label="Main" className={cx("sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto py-4 lg:block", collapsed ? "w-12" : "w-56")}>
      <NavLinks compact={collapsed} />
      {!collapsed && <Watchlists />}
    </nav>
  );
}

function MobileNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-muted")}>
                <Icon name={n.icon} />
                {n.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button onClick={onMenu} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted">
            <Icon name="more" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={onClose} />
      {/* Close after following any link inside the menu. */}
      <div
        ref={ref}
        className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-line bg-bg p-3"
        onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">{APP_NAME}</span>
          <button onClick={onClose} aria-label="Close menu" className="rounded p-1.5 text-muted hover:text-text">
            <Icon name="x" />
          </button>
        </div>
        <NavLinks />
        <Watchlists />
      </div>
    </div>
  );
}
