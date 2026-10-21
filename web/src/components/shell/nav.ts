import type { IconName } from "../icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/news", label: "Latest news", icon: "news" },
  { href: "/highlights", label: "Highlights", icon: "video" },
  { href: "/games", label: "Games & scores", icon: "calendar" },
  { href: "/players", label: "Players", icon: "user" },
  { href: "/teams", label: "Teams", icon: "users" },
  { href: "/injuries", label: "Injuries & lineups", icon: "medical" },
  { href: "/stats", label: "Stats & compare", icon: "chart" },
  { href: "/fantasy", label: "Fantasy", icon: "trophy" },
  { href: "/ai", label: "AI analyst", icon: "sparkles" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/saved", label: "Saved & watchlist", icon: "bookmark" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings & sources", icon: "settings" },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/games", label: "Games", icon: "calendar" },
  { href: "/highlights", label: "Video", icon: "video" },
  { href: "/saved", label: "Saved", icon: "bookmark" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
