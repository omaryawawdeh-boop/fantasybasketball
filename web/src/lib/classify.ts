import type { ContentType, SourceCategory, Verification } from "./types";

// Rule-based classification of headlines + summaries. Deliberately simple and inspectable:
// every rule is a regular expression, so a misclassification can be traced to a rule.

const RULES: { type: ContentType; re: RegExp }[] = [
  {
    type: "injury",
    re: /\b(injur(y|ies|ed)|out (for|indefinitely|tonight)|ruled out|questionable|doubtful|probable|day-to-day|sprain(ed)?|strain(ed)?|torn|tear|fracture[d]?|surgery|mri|concussion|sidelined|hamstring|ankle|knee|achilles|calf|groin|back spasms|illness|resting|load management|return(s|ed)? from|cleared to|availability|injury report|game-time decision|will miss|to miss|has missed)\b/i,
  },
  {
    type: "lineup",
    re: /\b(starting lineup|starting five|will start|to start|starts in place|moved? (in)?to the bench|bench role|move to the bench|rotation change|lineup change|starters?)\b/i,
  },
  {
    type: "transaction",
    re: /\b(trade[sd]?|trading|acquire[sd]?|sign(s|ed|ing)?|re-sign(s|ed)?|waive[sd]?|waiving|release[sd]?|extension|contract|two-way|10-day|buyout|free agen(t|cy)|deal with|claimed off|options? (exercised|declined)|traded to|rookie scale)\b/i,
  },
  {
    type: "rumor",
    re: /\b(rumou?rs?|could (pursue|target|trade|land|sign)|interested in|eye(s|ing)|monitor(s|ing)|linked to|explor(e|es|ing) (a )?trade|trade (talks|market|candidate|interest)|on the block|potential (trade|target)|in the mix|keeping tabs|have discussed|has discussed|expected to (explore|pursue))\b/i,
  },
  {
    type: "result",
    re: /\b(beat[s]?|defeat(s|ed)?|top(s|ped)|edge[sd]?|rout(s|ed)?|outlast(s|ed)?|hold off|win(s)? over|loss to|fall[s]? to|recap|final score|takeaways from|\d{2,3}-\d{2,3})\b/i,
  },
  {
    type: "fantasy",
    re: /\b(fantasy|waiver(s| wire)?|start\/sit|start or sit|sleepers?|streamers?|dfs|draftkings|fanduel|pickups?|busts?|buy[- ]low|sell[- ]high)\b/i,
  },
  {
    type: "interview",
    re: /\b(press conference|presser|interview|postgame|pregame|media day|podcast|mic'?d up|speaks|talks|said after|reacts)\b/i,
  },
  {
    type: "history",
    re: /\b(on this day|all-time|history|historic|hall of fame|anniversary|legend(s|ary)?|retire[sd]? (his )?jersey|throwback|classic|greatest|career milestone|passes .* on (the )?all-time)\b/i,
  },
  {
    type: "analysis",
    re: /\b(analysis|breakdown|film study|explained|power rankings?|grades?|ranking (the|every)|takeaways|what (we learned|it means)|why |how the|deep dive|projections?|predictions?|preview|biggest questions)\b/i,
  },
];

const HIGHLIGHT_RE = /\b(highlights?|dunk(s|ed)?|poster|game-winner|game winner|buzzer[- ]beater|block of the|plays of the|top \d+ plays|full game|mixtape|alley-?oop|crossover)\b/i;

/** Priority when several rules match: the most specific/actionable type wins. */
const PRIORITY: ContentType[] = [
  "injury",
  "transaction",
  "lineup",
  "rumor",
  "result",
  "fantasy",
  "interview",
  "history",
  "analysis",
];

/**
 * Classify an item. The headline decides the primary type when it matches any rule (a fantasy
 * column that mentions an injury is still a fantasy column); the summary only adds tags.
 */
export function classify(text: string, opts: { isVideo?: boolean; title?: string } = {}): { type: ContentType; tags: ContentType[] } {
  const all = classifyText(text, opts.isVideo);
  if (!opts.title) return all;
  const head = classifyText(opts.title, opts.isVideo);
  if (head.type === "news" || head.type === all.type || (opts.isVideo && head.type === "highlight")) return all;
  return { type: head.type, tags: [...new Set([all.type, ...all.tags, ...head.tags])].filter((t) => t !== head.type) };
}

function classifyText(text: string, isVideo?: boolean): { type: ContentType; tags: ContentType[] } {
  const opts = { isVideo };
  const matched = new Set<ContentType>();
  for (const r of RULES) if (r.re.test(text)) matched.add(r.type);
  if (opts.isVideo || HIGHLIGHT_RE.test(text)) {
    if (opts.isVideo) {
      const tags = [...matched];
      // A press conference video is an interview first, a highlight second.
      if (matched.has("interview")) return { type: "interview", tags: ["highlight", ...tags.filter((t) => t !== "interview")] };
      return { type: "highlight", tags };
    }
    matched.add("highlight");
  }
  // "Rumor" only applies to transaction-like speculation; a trade rumor is a rumor, not a done deal.
  if (matched.has("rumor") && matched.has("transaction")) matched.delete("transaction");
  const primary = PRIORITY.find((t) => matched.has(t)) ?? (matched.has("highlight") ? "highlight" : "news");
  return { type: primary, tags: [...matched].filter((t) => t !== primary) };
}

const OFFICIAL_TEXT = /\b(officially|announced|has (signed|waived|released|acquired)|the team (said|announced)|team announced|league announced|in a statement|official injury report|per the team|club announced)\b/i;
const REPORTED_TEXT = /\b(per (sources|[A-Z][a-z]+)|according to|sources (say|said|tell|told)|league sources|team sources|reportedly|told (ESPN|The Athletic|Yahoo|reporters)|is expected to|are expected to|has agreed|have agreed|agreed to)\b/i;
const SPECULATIVE = /\b(rumou?r|could|might|may be|interested in|eye(s|ing)|monitor(ing|s)|linked|explor(e|ing)|potential|would consider|on the block|keeping tabs|in the mix|speculation|hypothetical)\b/i;

/**
 * Per-item verification. Conservative by design:
 *  - "official" only when an official source published it, or the text explicitly describes an
 *    announcement by the team/league.
 *  - "rumor" when the language is speculative and nothing official is cited.
 *  - "reported" for national outlets otherwise; "unconfirmed" for aggregators/unknown sources.
 */
export function verify(text: string, category: SourceCategory): Verification {
  if (category === "official") return "official";
  if (OFFICIAL_TEXT.test(text) && !SPECULATIVE.test(text)) return "official";
  if (SPECULATIVE.test(text)) return "rumor";
  if (category === "national") return "reported";
  if (REPORTED_TEXT.test(text)) return "reported";
  return "unconfirmed";
}

const CITED_RE =
  /\b(?:per|according to|via|reports?|reported by)\s+(?:(?:ESPN|The Athletic|Yahoo Sports|Yahoo|Bleacher Report|NBA\.com|The Stein Line|Marc Stein|HoopsHype|SNY|The Ringer|NBA insider)(?:'s|’s)?\s+)?([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){1,2})/;

const NOT_PEOPLE = new Set(["The Athletic", "League Sources", "Team Sources", "Multiple Sources", "Sources Close", "The Team", "The League"]);

/** Extract a named reporter the text explicitly credits, e.g. "per Shams Charania". */
export function citedOrigin(text: string): string | null {
  const m = CITED_RE.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  if (NOT_PEOPLE.has(name) || /^(Sources|The)\b/.test(name)) return null;
  return name;
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  official: "Official",
  reported: "Reported",
  unconfirmed: "Unconfirmed",
  rumor: "Rumor",
};

export const VERIFICATION_HELP: Record<Verification, string> = {
  official: "Published by the league or a team, or the text describes an official announcement.",
  reported: "Reported by an established outlet. Not an official announcement.",
  unconfirmed: "Single report from a source that usually repeats others. Not independently confirmed.",
  rumor: "Speculative language (interest, could, monitoring). Treat as rumor.",
};
