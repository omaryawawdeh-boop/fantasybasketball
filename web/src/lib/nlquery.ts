import type { ContentType } from "./types";
import type { FeedFilter } from "./rank";
import { TEAMS } from "./teams";
import { editDistance, normalize } from "./text";

// Interprets natural-language search ("credible Knicks injury reports from the last 3 days")
// into explicit filters. The interpretation is shown to the user as removable chips, and the
// results are real items — nothing is generated.

export interface ParsedQuery {
  filter: Partial<FeedFilter>;
  /** Words that weren't consumed by a filter; used for keyword matching. */
  text: string;
  chips: { key: string; label: string }[];
  compare: string[] | null;
}

const TYPE_WORDS: [RegExp, ContentType][] = [
  [/\b(injur(y|ies|ed)|hurt|status|availability)\b/, "injury"],
  [/\b(trades?|signings?|signs?|transactions?|waived?|contracts?|extensions?)\b/, "transaction"],
  [/\b(highlights?|dunks?|videos?|clips?|plays)\b/, "highlight"],
  [/\b(lineups?|starters?|starting)\b/, "lineup"],
  [/\b(rumou?rs?|speculation)\b/, "rumor"],
  [/\b(fantasy|waiver)\b/, "fantasy"],
  [/\b(interviews?|press conferences?|pressers?|podcasts?)\b/, "interview"],
  [/\b(history|historical|records?|all-time)\b/, "history"],
  [/\b(analysis|breakdowns?|film)\b/, "analysis"],
  [/\b(scores?|results?|recaps?|box scores?)\b/, "result"],
];

const FILLER = new Set(
  "show me find get all every any the a an of about on for from in with and or me my latest newest recent biggest top most important stories story news updates update reports report credible verified confirmed official what is are whats happening".split(
    " ",
  ),
);

export interface QueryPlayer {
  id: string;
  name: string;
}

export function parseQuery(raw: string, players: QueryPlayer[], now = new Date()): ParsedQuery {
  let q = ` ${normalize(raw)} `;
  const filter: Partial<FeedFilter> = {};
  const chips: ParsedQuery["chips"] = [];

  // Compare intent: "compare A and B", "A vs B".
  let compare: string[] | null = null;
  const cm = /^\s*compare (.+?)\s*$/.exec(q) ?? /^\s*(.+?) (?:vs\.?|versus) (.+?)\s*$/.exec(q);
  if (cm) {
    const parts = (cm.length === 2 ? cm[1].split(/ (?:and|vs\.?|versus|with|to|,) /) : [cm[1], cm[2]]).map((s) => s.trim());
    const ids = parts.map((p) => matchPlayer(p, players)).filter((p): p is QueryPlayer => !!p);
    if (ids.length >= 2) compare = ids.map((p) => p.id);
  }

  // Time.
  const time: [RegExp, (m: RegExpExecArray) => number, (m: RegExpExecArray) => string][] = [
    [/ (?:last|past) (\d+) hours? /, (m) => Number(m[1]), (m) => `Last ${m[1]} hours`],
    [/ (?:last|past) (\d+|two|three|four|five|seven) days? /, (m) => 24 * wordNum(m[1]), (m) => `Last ${wordNum(m[1])} days`],
    [/ (?:this|past|last) week /, () => 168, () => "Past week"],
    [/ (?:this|past|last) month /, () => 720, () => "Past month"],
    [/ (?:since )?yesterday /, () => 24 + now.getHours(), () => "Since yesterday"],
    [/ today | tonight /, () => Math.max(1, now.getHours() + 1), () => "Today"],
  ];
  for (const [re, hours, label] of time) {
    const m = re.exec(q);
    if (m) {
      filter.sinceHours = hours(m);
      chips.push({ key: "time", label: label(m) });
      q = q.replace(m[0], " ");
      break;
    }
  }

  // Credibility.
  if (/ official(ly)? /.test(q)) {
    filter.verification = "official";
    chips.push({ key: "verification", label: "Official only" });
  } else if (/ (credible|verified|confirmed|reliable) /.test(q)) {
    filter.verification = "credible";
    chips.push({ key: "verification", label: "Official + reported" });
  }

  // Types.
  const types: ContentType[] = [];
  for (const [re, t] of TYPE_WORDS) {
    if (re.test(q)) {
      types.push(t);
      q = q.replace(re, " ");
    }
  }
  if (types.length) {
    filter.types = types;
    chips.push({ key: "types", label: types.join(" + ") });
  }

  // Sort.
  if (/ (latest|newest|most recent) /.test(q)) filter.sort = "latest";
  else if (/ (biggest|top|most important|important) /.test(q)) filter.sort = "ranked";

  // Teams (case-insensitive here: people type lowercase).
  const teamIds: string[] = [];
  for (const t of TEAMS) {
    for (const a of [...t.aliases, t.abbr].map((x) => normalize(x)).sort((x, y) => y.length - x.length)) {
      const re = new RegExp(` ${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s? `);
      if (a.length >= 3 && re.test(q)) {
        teamIds.push(t.id);
        q = q.replace(re, " ");
        chips.push({ key: `team:${t.id}`, label: t.name });
        break;
      }
    }
  }
  if (teamIds.length) filter.teamIds = teamIds;

  // Players: full names, then unique last names, then fuzzy full names.
  const playerIds: string[] = [];
  for (const p of players) {
    const n = normalize(p.name);
    if (n && q.includes(` ${n} `)) {
      playerIds.push(p.id);
      q = q.replace(` ${n} `, " ");
      chips.push({ key: `player:${p.id}`, label: p.name });
    }
  }
  const rest = q.split(" ").filter((w) => w && !FILLER.has(w));
  if (!playerIds.length && rest.length) {
    for (let size = Math.min(3, rest.length); size >= 1 && !playerIds.length; size--) {
      for (let i = 0; i + size <= rest.length; i++) {
        const phrase = rest.slice(i, i + size).join(" ");
        const p = matchPlayer(phrase, players);
        if (p) {
          playerIds.push(p.id);
          q = q.replace(` ${phrase} `, " ");
          chips.push({ key: `player:${p.id}`, label: p.name });
          break;
        }
      }
    }
  }
  if (playerIds.length) filter.playerIds = playerIds;

  const text = q
    .split(" ")
    .filter((w) => w && !FILLER.has(w) && !/^(last|past|days?|hours?|since|this|week|month)$/.test(w))
    .join(" ");
  return { filter, text, chips, compare };
}

function wordNum(w: string): number {
  const map: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, seven: 7 };
  return map[w] ?? Number(w);
}

/** Exact full name, unique last name (≥4 letters), or full name within a small edit distance. */
export function matchPlayer(phrase: string, players: QueryPlayer[]): QueryPlayer | null {
  const q = normalize(phrase).replace(/\./g, "");
  if (q.length < 3) return null;
  const exact = players.find((p) => normalize(p.name).replace(/\./g, "") === q);
  if (exact) return exact;
  if (!q.includes(" ") && q.length >= 4) {
    const byLast = players.filter((p) => normalize(p.name).split(" ").slice(-1)[0] === q);
    if (byLast.length === 1) return byLast[0];
  }
  if (q.includes(" ") && q.length >= 7) {
    let best: QueryPlayer | null = null;
    let bestD = 3;
    for (const p of players) {
      const d = editDistance(q, normalize(p.name), 2);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
  return null;
}
