import type { TeamInfo } from "./types";

// Static team identity: ESPN team id, common abbreviation, names, colors and conference.
// These are stable facts used for linking and display; logos are deliberately not used.
// `espnAbbr` is the abbreviation ESPN's APIs return (they differ for NY, GS, SA, NO, UTAH, WSH).

export interface TeamDef extends TeamInfo {
  espnAbbr: string;
  /** Words that unambiguously refer to this team in NBA headlines. */
  aliases: string[];
}

const T = (
  id: string,
  abbr: string,
  espnAbbr: string,
  location: string,
  nickname: string,
  color: string,
  altColor: string,
  conference: "East" | "West",
  aliases: string[] = [],
): TeamDef => ({
  id,
  abbr,
  espnAbbr,
  location,
  nickname,
  name: `${location} ${nickname}`,
  color,
  altColor,
  conference,
  aliases: [nickname, `${location} ${nickname}`, ...aliases],
});

export const TEAMS: TeamDef[] = [
  T("1", "ATL", "ATL", "Atlanta", "Hawks", "#C8102E", "#FDB927", "East"),
  T("2", "BOS", "BOS", "Boston", "Celtics", "#007A33", "#BA9653", "East", ["Celts"]),
  T("17", "BKN", "BKN", "Brooklyn", "Nets", "#000000", "#FFFFFF", "East"),
  T("30", "CHA", "CHA", "Charlotte", "Hornets", "#1D1160", "#00788C", "East"),
  T("4", "CHI", "CHI", "Chicago", "Bulls", "#CE1141", "#000000", "East"),
  T("5", "CLE", "CLE", "Cleveland", "Cavaliers", "#860038", "#FDBB30", "East", ["Cavs"]),
  T("6", "DAL", "DAL", "Dallas", "Mavericks", "#00538C", "#B8C4CA", "West", ["Mavs"]),
  T("7", "DEN", "DEN", "Denver", "Nuggets", "#0E2240", "#FEC524", "West"),
  T("8", "DET", "DET", "Detroit", "Pistons", "#C8102E", "#1D42BA", "East"),
  T("9", "GSW", "GS", "Golden State", "Warriors", "#1D428A", "#FFC72C", "West", ["Golden State", "Dubs"]),
  T("10", "HOU", "HOU", "Houston", "Rockets", "#CE1141", "#000000", "West"),
  T("11", "IND", "IND", "Indiana", "Pacers", "#002D62", "#FDBB30", "East"),
  T("12", "LAC", "LAC", "LA", "Clippers", "#C8102E", "#1D428A", "West", ["Los Angeles Clippers"]),
  T("13", "LAL", "LAL", "Los Angeles", "Lakers", "#552583", "#FDB927", "West", ["LA Lakers"]),
  T("29", "MEM", "MEM", "Memphis", "Grizzlies", "#5D76A9", "#12173F", "West", ["Grizz"]),
  T("14", "MIA", "MIA", "Miami", "Heat", "#98002E", "#F9A01B", "East"),
  T("15", "MIL", "MIL", "Milwaukee", "Bucks", "#00471B", "#EEE1C6", "East"),
  T("16", "MIN", "MIN", "Minnesota", "Timberwolves", "#0C2340", "#236192", "West", ["Wolves", "T-Wolves"]),
  T("3", "NOP", "NO", "New Orleans", "Pelicans", "#0C2340", "#C8102E", "West", ["Pels"]),
  T("18", "NYK", "NY", "New York", "Knicks", "#006BB6", "#F58426", "East"),
  T("25", "OKC", "OKC", "Oklahoma City", "Thunder", "#007AC1", "#EF3B24", "West"),
  T("19", "ORL", "ORL", "Orlando", "Magic", "#0077C0", "#C4CED4", "East"),
  T("20", "PHI", "PHI", "Philadelphia", "76ers", "#006BB6", "#ED174C", "East", ["Sixers"]),
  T("21", "PHX", "PHX", "Phoenix", "Suns", "#1D1160", "#E56020", "West"),
  T("22", "POR", "POR", "Portland", "Trail Blazers", "#E03A3E", "#000000", "West", ["Blazers"]),
  T("23", "SAC", "SAC", "Sacramento", "Kings", "#5A2D81", "#63727A", "West"),
  T("24", "SAS", "SA", "San Antonio", "Spurs", "#C4CED4", "#000000", "West"),
  T("28", "TOR", "TOR", "Toronto", "Raptors", "#CE1141", "#000000", "East", ["Raps"]),
  T("26", "UTA", "UTAH", "Utah", "Jazz", "#002B5C", "#F9A01B", "West"),
  T("27", "WAS", "WSH", "Washington", "Wizards", "#002B5C", "#E31837", "East", ["Wiz"]),
];

const byId = new Map(TEAMS.map((t) => [t.id, t]));
const byAbbr = new Map<string, TeamDef>();
for (const t of TEAMS) {
  byAbbr.set(t.abbr, t);
  byAbbr.set(t.espnAbbr, t);
}
// Other abbreviations seen in feeds.
byAbbr.set("NOR", byId.get("3")!);
byAbbr.set("GS", byId.get("9")!);
byAbbr.set("SA", byId.get("24")!);
byAbbr.set("NY", byId.get("18")!);
byAbbr.set("UTAH", byId.get("26")!);
byAbbr.set("WSH", byId.get("27")!);
byAbbr.set("PHO", byId.get("21")!);
byAbbr.set("BRK", byId.get("17")!);
byAbbr.set("CHO", byId.get("30")!);

export function teamById(id: string | null | undefined): TeamDef | undefined {
  return id ? byId.get(String(id)) : undefined;
}

export function teamByAbbr(abbr: string | null | undefined): TeamDef | undefined {
  return abbr ? byAbbr.get(abbr.toUpperCase()) : undefined;
}

/** Readable text color for a team-colored badge. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
}
