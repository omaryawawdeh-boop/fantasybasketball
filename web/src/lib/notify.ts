import type { Game, StoryCluster } from "./types";
import { rankCluster, EMPTY_RANK_PREFS } from "./rank";
import { normalize } from "./text";

// Turns feed/scoreboard state into notification events. Each event has a stable key so the same
// underlying event never notifies twice; a story that gains a new report (e.g. Questionable → Out)
// gets a new key.

export interface NotifSettings {
  enabled: boolean;
  breaking: boolean;
  injuries: boolean;
  lineups: boolean;
  transactions: boolean;
  gameStart: boolean;
  finals: boolean;
  fantasy: boolean;
  keywords: string[];
  quietStart: number | null;
  quietEnd: number | null;
  followedOnly: boolean;
}

export interface NotifEvent {
  key: string;
  at: string;
  title: string;
  body: string;
  href: string;
  kind: "breaking" | "injury" | "lineup" | "transaction" | "gameStart" | "final" | "fantasy" | "keyword";
}

export function inQuietHours(p: NotifSettings, d = new Date()): boolean {
  if (p.quietStart == null || p.quietEnd == null) return false;
  const h = d.getHours();
  return p.quietStart <= p.quietEnd ? h >= p.quietStart && h < p.quietEnd : h >= p.quietStart || h < p.quietEnd;
}

export function computeEvents(
  clusters: StoryCluster[],
  games: Game[],
  n: NotifSettings,
  followed: { teams: string[]; players: string[] },
  now: number,
): NotifEvent[] {
  const out: NotifEvent[] = [];
  const rp = { ...EMPTY_RANK_PREFS, followedTeams: followed.teams, followedPlayers: followed.players };
  const fp = new Set(rp.followedPlayers);
  const ft = new Set(rp.followedTeams);
  const isMine = (c: StoryCluster) => c.playerIds.some((p) => fp.has(p)) || c.teamIds.some((t) => ft.has(t));
  for (const c of clusters) {
    if (now - Date.parse(c.lastUpdatedAt) > 12 * 3600_000) continue;
    const mine = isMine(c);
    const big = c.importance >= 0.7;
    const href = `/?story=${c.id}`;
    const base = { at: c.lastUpdatedAt, title: c.lead.title, href };
    // One notification per story per update count, so a status change re-notifies but repeats don't.
    const ver = `${c.id}:${c.items.length}`;
    if (n.breaking && rankCluster(c, rp, now).breaking) out.push({ ...base, key: `brk:${c.id}`, body: "Breaking", kind: "breaking" });
    if (n.followedOnly && !mine) continue;
    if (n.injuries && c.type === "injury" && (mine || big)) out.push({ ...base, key: `inj:${ver}`, body: c.items.length > 1 ? "Injury status updated" : "Injury update", kind: "injury" });
    if (n.lineups && c.type === "lineup" && (mine || big)) out.push({ ...base, key: `lin:${ver}`, body: "Lineup change", kind: "lineup" });
    if (n.transactions && c.type === "transaction" && (mine || big)) out.push({ ...base, key: `trx:${ver}`, body: c.verification === "official" ? "Official transaction" : "Transaction report", kind: "transaction" });
    if (n.fantasy && mine && (c.type === "fantasy" || c.tags.includes("fantasy") || c.type === "injury")) out.push({ ...base, key: `fan:${ver}`, body: "Fantasy-relevant update", kind: "fantasy" });
    if (n.keywords.length) {
      const text = normalize(`${c.lead.title} ${c.lead.summary}`);
      const k = n.keywords.find((kw) => kw.trim() && text.includes(normalize(kw)));
      if (k) out.push({ ...base, key: `kw:${c.id}:${normalize(k)}`, body: `Keyword: ${k}`, kind: "keyword" });
    }
  }
  for (const g of games) {
    const mine = ft.has(g.home.id) || ft.has(g.away.id);
    if (!mine) continue;
    const title = `${g.away.abbr} at ${g.home.abbr}`;
    if (n.gameStart && g.state === "in") out.push({ key: `gs:${g.id}`, at: new Date(now).toISOString(), title, body: "Game started", href: `/games/${g.id}`, kind: "gameStart" });
    if (n.finals && g.state === "post")
      out.push({ key: `gf:${g.id}`, at: new Date(now).toISOString(), title, body: `Final: ${g.away.abbr} ${g.away.score ?? ""} – ${g.home.abbr} ${g.home.score ?? ""}`, href: `/games/${g.id}`, kind: "final" });
  }
  return out;
}

