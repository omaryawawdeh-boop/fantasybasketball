import { TEAMS } from "./teams";
import { normalize } from "./text";

// Links free text to players and teams.
// - Full player names always match.
// - A bare last name matches only if it is unique in the index, at least 5 letters, and the
//   player's current team is also mentioned (cuts "Green"/"Brown"-style false positives).
// - Team nicknames match case-sensitively ("Heat", "Magic"), so ordinary words rarely match.

export interface IndexedPlayer {
  id: string;
  name: string;
  teamId: string | null;
}

export interface EntityIndex {
  full: Map<string, IndexedPlayer>;
  last: Map<string, IndexedPlayer | null>;
  players: Map<string, IndexedPlayer>;
}

export function buildEntityIndex(players: IndexedPlayer[]): EntityIndex {
  const full = new Map<string, IndexedPlayer>();
  const last = new Map<string, IndexedPlayer | null>();
  const byId = new Map<string, IndexedPlayer>();
  for (const p of players) {
    const n = normalize(p.name).replace(/\./g, "");
    if (!n) continue;
    full.set(n, p);
    byId.set(p.id, p);
    const parts = n.split(" ").filter((w) => !/^(jr|sr|ii|iii|iv)$/.test(w));
    const ln = parts[parts.length - 1];
    if (ln && ln.length >= 5) last.set(ln, last.has(ln) ? null : p);
  }
  return { full, last, players: byId };
}

const teamPatterns = TEAMS.map((t) => ({
  id: t.id,
  res: t.aliases.map((a) => new RegExp(`(^|[^A-Za-z])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z])`)),
}));

export function linkTeams(text: string): string[] {
  const out: string[] = [];
  for (const t of teamPatterns) if (t.res.some((re) => re.test(text))) out.push(t.id);
  return out;
}

export function linkEntities(
  text: string,
  index: EntityIndex | null,
  hints: { playerIds?: string[]; teamIds?: string[] } = {},
): { playerIds: string[]; teamIds: string[] } {
  const teamIds = new Set<string>([...(hints.teamIds ?? []), ...linkTeams(text)]);
  const playerIds = new Set<string>(hints.playerIds ?? []);
  if (index) {
    const norm = ` ${normalize(text).replace(/\./g, "")} `;
    for (const [name, p] of index.full) {
      if (norm.includes(` ${name} `)) playerIds.add(p.id);
    }
    for (const [ln, p] of index.last) {
      if (!p || playerIds.has(p.id)) continue;
      if (p.teamId && teamIds.has(p.teamId) && norm.includes(` ${ln} `)) playerIds.add(p.id);
    }
    for (const id of playerIds) {
      const p = index.players.get(id);
      if (p?.teamId) teamIds.add(p.teamId);
    }
  }
  return { playerIds: [...playerIds], teamIds: [...teamIds] };
}
