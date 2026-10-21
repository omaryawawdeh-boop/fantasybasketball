"use client";

import type { ContentType, StoryCluster } from "@/lib/types";
import { DEFAULT_FANTASY, type FantasyConfig } from "@/lib/fantasy";
import type { RankPrefs } from "@/lib/rank";
import { createStore, useStore } from "./storage";

// All personal state lives in the browser (no account, no server storage).

export interface FollowedPlayer {
  id: string;
  name: string;
  teamId: string | null;
}

export interface NotifPrefs {
  enabled: boolean;
  breaking: boolean;
  injuries: boolean;
  lineups: boolean;
  transactions: boolean;
  gameStart: boolean;
  finals: boolean;
  fantasy: boolean;
  keywords: string[];
  /** Quiet hours in local time, e.g. 23 → 8. Null = none. */
  quietStart: number | null;
  quietEnd: number | null;
  /** Only alert about followed players/teams (except breaking news). */
  followedOnly: boolean;
}

export interface Prefs {
  theme: "dark" | "light";
  followedTeams: string[];
  followedPlayers: FollowedPlayer[];
  preferredTypes: ContentType[];
  mutedTypes: ContentType[];
  mutedKeywords: string[];
  hiddenSources: string[];
  /** Load publisher-provided images (news photos, headshots). Off by default — see Settings. */
  publisherImages: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  savedSearches: string[];
  fantasy: FantasyConfig;
  /** Extra players in the fantasy pool beyond the watchlist. */
  fantasyPool: FollowedPlayer[];
  notifications: NotifPrefs;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  followedTeams: [],
  followedPlayers: [],
  preferredTypes: [],
  mutedTypes: [],
  mutedKeywords: [],
  hiddenSources: [],
  publisherImages: false,
  leftCollapsed: false,
  rightCollapsed: false,
  savedSearches: [],
  fantasy: DEFAULT_FANTASY,
  fantasyPool: [],
  notifications: {
    enabled: true,
    breaking: true,
    injuries: true,
    lineups: true,
    transactions: true,
    gameStart: true,
    finals: true,
    fantasy: false,
    keywords: [],
    quietStart: null,
    quietEnd: null,
    followedOnly: false,
  },
};

export const prefsStore = createStore<Prefs>("hw.prefs.v1", DEFAULT_PREFS, (raw) => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Prefs>;
  return {
    ...DEFAULT_PREFS,
    ...r,
    fantasy: { ...DEFAULT_FANTASY, ...(r.fantasy ?? {}), weights: { ...DEFAULT_FANTASY.weights, ...(r.fantasy?.weights ?? {}) } },
    notifications: { ...DEFAULT_PREFS.notifications, ...(r.notifications ?? {}) },
  };
});

export function usePrefs(): Prefs {
  return useStore(prefsStore, DEFAULT_PREFS);
}

export function updatePrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  prefsStore.set((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
}

export function toggleTeam(id: string) {
  updatePrefs((p) => ({ followedTeams: p.followedTeams.includes(id) ? p.followedTeams.filter((t) => t !== id) : [...p.followedTeams, id] }));
}

export function togglePlayer(pl: FollowedPlayer) {
  updatePrefs((p) => ({
    followedPlayers: p.followedPlayers.some((x) => x.id === pl.id) ? p.followedPlayers.filter((x) => x.id !== pl.id) : [...p.followedPlayers, pl],
  }));
}

// ---------- saved stories (a snapshot, so they survive the story leaving the feed) ----------

export interface SavedStory {
  id: string;
  savedAt: string;
  title: string;
  summary: string;
  url: string | null;
  sourceName: string;
  publishedAt: string;
  type: ContentType;
  teamIds: string[];
  playerIds: string[];
  demo: boolean;
}

export const savedStore = createStore<SavedStory[]>("hw.saved.v1", [], (raw) => (Array.isArray(raw) ? (raw as SavedStory[]) : []));

export function useSaved(): SavedStory[] {
  return useStore(savedStore, EMPTY);
}
const EMPTY: SavedStory[] = [];

export function toggleSaved(c: StoryCluster) {
  savedStore.set((list) =>
    list.some((s) => s.id === c.id)
      ? list.filter((s) => s.id !== c.id)
      : [
          {
            id: c.id,
            savedAt: new Date().toISOString(),
            title: c.lead.title,
            summary: c.lead.summary,
            url: c.lead.url,
            sourceName: c.lead.sourceName,
            publishedAt: c.lead.publishedAt,
            type: c.type,
            teamIds: c.teamIds,
            playerIds: c.playerIds,
            demo: c.lead.provenance.mode === "demo",
          },
          ...list,
        ],
  );
}

export function rankPrefsFrom(p: Prefs, saved: SavedStory[]): RankPrefs {
  return {
    followedTeams: p.followedTeams,
    followedPlayers: p.followedPlayers.map((x) => x.id),
    preferredTypes: p.preferredTypes,
    mutedTypes: p.mutedTypes,
    mutedKeywords: p.mutedKeywords,
    hiddenSources: p.hiddenSources,
    savedAffinity: { teamIds: [...new Set(saved.flatMap((s) => s.teamIds))], playerIds: [...new Set(saved.flatMap((s) => s.playerIds))] },
  };
}

// ---------- notifications ----------

export interface AppNotification {
  id: string;
  /** Dedupe key for the underlying event (cluster id + status, game id + phase, …). */
  key: string;
  at: string;
  title: string;
  body: string;
  href: string;
  kind: "breaking" | "injury" | "lineup" | "transaction" | "gameStart" | "final" | "fantasy" | "keyword";
  read: boolean;
}

export interface NotifState {
  items: AppNotification[];
  /** Keys already notified or already seen at first load — never notify twice. */
  seen: string[];
  primed: boolean;
}

export const notifStore = createStore<NotifState>("hw.notifications.v1", { items: [], seen: [], primed: false });

export function useNotifications(): NotifState {
  return useStore(notifStore, EMPTY_NOTIFS);
}
const EMPTY_NOTIFS: NotifState = { items: [], seen: [], primed: false };

// ---------- injury status history (built from what this browser has seen) ----------

export interface StatusPoint {
  status: string;
  reportedAt: string | null;
  firstSeen: string;
  detail: string | null;
}

export const injuryHistoryStore = createStore<Record<string, StatusPoint[]>>("hw.injuryHistory.v1", {}, (raw) =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, StatusPoint[]>) : {},
);

export function useInjuryHistory() {
  return useStore(injuryHistoryStore, EMPTY_HIST);
}
const EMPTY_HIST: Record<string, StatusPoint[]> = {};

export function resetPersonalization() {
  updatePrefs({
    followedTeams: [],
    followedPlayers: [],
    preferredTypes: [],
    mutedTypes: [],
    mutedKeywords: [],
    hiddenSources: [],
    savedSearches: [],
  });
}
