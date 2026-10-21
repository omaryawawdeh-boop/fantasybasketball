import type { SourceCategory } from "./types";

// Source registry. Every news/video source the app can read is listed here with its credibility
// category. Categories describe the publisher, not the claim:
//  - official:   the league or a team speaking for itself
//  - national:   established outlets with their own reporters
//  - aggregator: sites that mostly repeat other outlets' reports (useful, but not independent)
//  - video:      third-party video channels
// URLs were chosen from publicly advertised RSS feeds. They could not be tested from the build
// environment (no outbound network), so the Settings → Data sources page reports what actually
// works at runtime.

export interface SourceDef {
  id: string;
  name: string;
  category: SourceCategory;
  kind: "rss" | "youtube" | "espn-api";
  url?: string;
  /** Hostnames whose links belong to this source. */
  hosts: string[];
  /** Weight 0..1 used by ranking. */
  credibility: number;
  enabledByDefault: boolean;
  notes: string;
}

export const SOURCES: SourceDef[] = [
  {
    id: "espn-api",
    name: "ESPN",
    category: "national",
    kind: "espn-api",
    hosts: ["espn.com", "www.espn.com", "espn.go.com"],
    credibility: 0.85,
    enabledByDefault: true,
    notes: "ESPN's public JSON used by espn.com (undocumented; no key; may change without notice).",
  },
  {
    id: "espn-rss",
    name: "ESPN",
    category: "national",
    kind: "rss",
    url: "https://www.espn.com/espn/rss/nba/news",
    hosts: ["espn.com", "www.espn.com"],
    credibility: 0.85,
    enabledByDefault: true,
    notes: "Public RSS feed. Headlines and short descriptions only.",
  },
  {
    id: "cbs",
    name: "CBS Sports",
    category: "national",
    kind: "rss",
    url: "https://www.cbssports.com/rss/headlines/nba/",
    hosts: ["cbssports.com", "www.cbssports.com"],
    credibility: 0.8,
    enabledByDefault: true,
    notes: "Public RSS feed.",
  },
  {
    id: "yahoo",
    name: "Yahoo Sports",
    category: "national",
    kind: "rss",
    url: "https://sports.yahoo.com/nba/rss/",
    hosts: ["sports.yahoo.com"],
    credibility: 0.75,
    enabledByDefault: true,
    notes: "Public RSS feed. Mixes original reporting and syndicated wire copy.",
  },
  {
    id: "nbcsports",
    name: "NBC Sports",
    category: "national",
    kind: "rss",
    url: "https://www.nbcsports.com/nba.rss",
    hosts: ["nbcsports.com", "www.nbcsports.com"],
    credibility: 0.75,
    enabledByDefault: true,
    notes: "Public RSS feed (URL unverified from build environment).",
  },
  {
    id: "hoopshype",
    name: "HoopsHype",
    category: "aggregator",
    kind: "rss",
    url: "https://hoopshype.com/feed/",
    hosts: ["hoopshype.com"],
    credibility: 0.5,
    enabledByDefault: true,
    notes: "Rumor aggregator. Items usually cite another outlet; treated as non-independent.",
  },
  {
    id: "realgm",
    name: "RealGM Wiretap",
    category: "aggregator",
    kind: "rss",
    url: "https://basketball.realgm.com/rss/wiretap/0/0.xml",
    hosts: ["basketball.realgm.com", "realgm.com"],
    credibility: 0.5,
    enabledByDefault: true,
    notes: "Wire of transactions and reports, mostly citing other outlets.",
  },
  {
    id: "yt-nba",
    name: "NBA (YouTube)",
    category: "official",
    kind: "youtube",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCWJ2lWNubArHWmf3FIHbfcQ",
    hosts: ["youtube.com", "www.youtube.com"],
    credibility: 0.95,
    enabledByDefault: true,
    notes: "The league's official YouTube channel feed (no API key needed). Videos embed via YouTube's player.",
  },
];

export function sourceById(id: string): SourceDef | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** Official team / league web hosts. Items linked from these are official announcements. */
const OFFICIAL_HOSTS = [/(^|\.)nba\.com$/];

export function isOfficialHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return OFFICIAL_HOSTS.some((re) => re.test(h));
  } catch {
    return false;
  }
}

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  official: "Official source",
  national: "National outlet",
  aggregator: "Aggregator",
  video: "Video channel",
};
