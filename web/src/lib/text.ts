// Small text utilities used by classification, clustering and search.

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on at for with from by as is are was were be been being it its " +
    "this that these those he she they his her their them him we you your our i me my not no " +
    "will would could should can may might has have had do does did after before over into out up " +
    "about vs v say says said per report reports reported sources source nba game games season " +
    "night tonight today new first last what why how who when where amid set sets just more than"
  ).split(" "),
);

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9%.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Spelling-tolerant match score of a query against a text (0 = no match, higher = better).
 * Every query word must match a word in the text exactly, by prefix, or within a small edit distance.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = normalize(query).split(" ").filter(Boolean);
  if (q.length === 0) return 0;
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  let score = 0;
  for (const qw of q) {
    let best = 0;
    for (const w of words) {
      if (w === qw) best = Math.max(best, 3);
      else if (w.startsWith(qw) && qw.length >= 2) best = Math.max(best, 2);
      else if (qw.length >= 4 && editDistance(qw, w, qw.length >= 7 ? 2 : 1) <= (qw.length >= 7 ? 2 : 1))
        best = Math.max(best, 1);
    }
    if (best === 0) return 0;
    score += best;
  }
  // Prefer texts where the whole query appears as a phrase.
  if (normalize(text).includes(normalize(query))) score += 2;
  return score;
}

/** Remove HTML tags and decode common entities. Output is plain text, never rendered as HTML. */
export function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

/** A short stable hash for ids (FNV-1a). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Only allow http(s) URLs through to links and iframes. */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
