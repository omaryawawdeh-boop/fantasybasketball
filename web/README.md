# Hardwood Wire

A personal NBA intelligence feed: breaking news, highlights, injuries, lineups, scores, box scores, player and team pages, stat comparisons, fantasy tools and a grounded AI analyst. All of it in one place, without social-media noise.

**Cost: $0 to run.** No paid data feed, database, search service or hosting is required. An AI provider is optional, and several have free tiers (see [AI analyst](#ai-analyst-optional)).

---

## Name

Five candidates:

1. **Hardwood Wire** (chosen). "Wire" as in news wire: fast, sourced, factual. "Hardwood" says basketball without borrowing anyone's trademark.
2. Baseline Brief
3. Full Court Signal
4. Tipoff Ledger
5. Paint Report

The working name is set in `src/components/shell/AppShell.tsx` (`APP_NAME`) and `src/app/layout.tsx`, so it's easy to change.

---

## Quick start

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org)).

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000. That's it: no keys or accounts needed.

**First run:** open **Settings → Data sources** (`/settings#sources`). It shows which sources actually answered on your machine, which failed, and why. The source integrations could not be tested live while this was being built (see [What was verified](#what-was-verified)), so check this page first.

**Try it offline / without any network:** set `DATA_MODE=demo`:

```bash
# macOS / Linux
DATA_MODE=demo npm run dev
# Windows PowerShell
$env:DATA_MODE="demo"; npm run dev
```

Or put `DATA_MODE=demo` in `web/.env.local`. Demo data is **fictional**: invented players, headlines starting "Demo —", and a yellow "Demo" badge on every item.

### Settings file

Copy `.env.example` to `.env.local` and uncomment what you want. Every setting is optional. `.env.local` is git-ignored, and keys are only ever read on the server.

### Run it like a real app (optional, free)

- **On your own computer:** `npm run build && npm start` gives a faster production server on port 3000.
- **On the internet for free:** push the repo to GitHub, import it at [vercel.com](https://vercel.com) (Hobby plan, free for personal use), set **Root Directory = `web`**, and add any `.env.local` values under Project → Settings → Environment Variables. Since there's no login, anyone with the URL can use it. That's fine for a personal reader, but don't share the URL if you've added a paid AI key.

---

## What's in it

| Area | Status | Notes |
| --- | --- | --- |
| Home feed (ranked, de-duplicated, filterable) | ✅ Implemented | Scoreboard strip, featured top story, breaking/injury flags, "N new stories" button instead of reshuffling while you read. |
| Feed filters | ✅ | Type, team, followed player, time range, verification, source type, last-24h vs archive, sort. All filters combine. |
| Story clustering & verification labels | ✅ | Official / Reported / Unconfirmed / Rumor. Several outlets repeating a report never upgrades it to Official. Shows original outlet, independent outlets and credited reporter. |
| In-app story reader | ✅ | Headline, the publisher's own summary, full report timeline with timestamps, provenance, link to the full article. Full article text is not copied. |
| Video | ✅ (YouTube) | Click-to-play embedded player (youtube-nocookie). Nothing loads until you press play. Non-embeddable sources get an honest message and a labeled external link. |
| Scoreboard & calendar | ✅ | Live/upcoming/final, day picker, team and status filters, live refresh every 30 s during games. |
| Game pages | ✅ | Linescore, full box scores, DNP reasons, confirmed starters (once the box score marks them), previous game's starters before tip-off (labeled as such). |
| Player profiles | ✅ | Bio, season averages, last 10, TS%/eFG%, trend chart, game log, career table, upcoming games with back-to-backs, news timeline with category tabs, availability + status history, fantasy outlook. |
| Team pages | ✅ | Record, schedule, results, injuries, last game's starters, roster, fantasy implications (labeled analysis), news tabs, standings. |
| Injuries & lineups tracker | ✅ | Filters, previous status, today's games, lineup confirmation state. |
| Stats & comparisons | ✅ | Up to 4 players; full season, last N, or date range; per game, totals, per 36; "recent vs previous N" split; chart; team comparison. |
| Fantasy center | ✅ | Configurable points or category scoring (presets incl. your tier-sheet league), player pool, FP/G, trend, minutes trend, games in horizon, back-to-backs, projection with range and stated assumptions, buy-low/sell-high (analysis), 2025-26 baseline from your tier sheet. |
| AI analyst | ✅ when configured | Retrieves the app's own stories, injuries, scores and stats first, cites them as [S1]…, and knows the page you're on. Without a provider, it explains the setup and shows the sources it would have used. |
| Search | ✅ | Players, teams, games (±3 days), stories, injuries, sources. Typo-tolerant. Plain-language filters ("Knicks injuries last 3 days") are shown as removable chips. "Compare A and B" opens the comparison. |
| Saved items & watchlists | ✅ | Saved stories keep a copy after they leave the feed. Follows, saved searches, fantasy pool. |
| Notifications | ✅ in-app only | Bell menu while the app is open. Breaking, injuries, lineups, transactions, game start/final, fantasy, keywords, quiet hours, followed-only, master switch. Each event alerts once. **No push notifications.** |
| Settings & data-source status | ✅ | Theme, publisher images, personalization (boost/hide categories, muted words, hidden sources, reset), alerts, live source status, export/delete local data. |
| History section | ⚠️ Partial | Historical *stories* from the feed plus career tables. No all-time leaderboards (no free, permitted source found). |
| Advanced metrics (usage, on/off, PER) | ❌ Not yet | Needs play-by-play or league-wide data. TS% and eFG% are included. |
| Waiver-wire finder | ❌ Not possible here | Needs your league's rosters, which this app has no authorized way to read. |

Layout: three columns on desktop (navigation, feed, games/injuries/top stories), both sidebars collapsible. On phones: a compact top bar, a full-width feed and a bottom nav. Dark theme by default, with a light theme in Settings. Keyboard: `/` focuses search, `Esc` closes dialogs, and arrow keys move between profile tabs. Focus is always visible, and reduced-motion settings are respected.

---

## AI analyst (optional)

Choose one provider and set it in `.env.local`. Your questions, plus the source snippets the app retrieved, go to that provider and nowhere else.

| Provider | Cost | Setup |
| --- | --- | --- |
| **Groq** (recommended free option) | Free tier, no credit card. Rate-limited per model ([live limits](https://console.groq.com/settings/limits)) | `AI_PROVIDER=groq`, `AI_API_KEY`, `AI_MODEL` = a current id from Groq's model list |
| Google Gemini | Free tier. Google may use free-tier prompts to improve its products | `AI_PROVIDER=gemini`, `AI_API_KEY`, `AI_MODEL` |
| OpenRouter | Some models free (ids ending `:free`) | `AI_PROVIDER=openrouter`, `AI_API_KEY`, `AI_MODEL` |
| Ollama (your computer) | Free and private, but slower and needs a decent machine | `AI_PROVIDER=ollama`, `AI_MODEL=llama3.2` |
| **Anthropic Claude** | Paid per use. Best answers | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, optional `AI_MODEL` (default `claude-opus-5-5`) |

Budget note for Claude: Opus 5.5 costs $4 per million input tokens and $20 per million output tokens. A typical question here sends roughly 3–8k tokens of sources, so it costs a few cents, and $10–20 covers several hundred questions. `AI_MODEL=claude-haiku-5-5` ($0.10/$0.50 per million) costs a fraction of a cent per question. Set a monthly spend limit in the Anthropic console to stay safe.

Model names change often, so the app doesn't guess one for the free providers. Copy a current model id from the provider's own model list into `AI_MODEL`.

How the analyst stays grounded:

- It retrieves first: matching stories, the injury list, standings, schedule, box scores, and the stats of the player on the current page.
- The model is told to answer only from those numbered sources and cite each claim as `[S#]`. The UI turns each citation into a link to that source's real URL or in-app page. Citations to sources that don't exist are blanked out.
- It must say when data is missing, describe conflicts between sources, and label analysis and opinions as analysis.
- Retrieved text is wrapped as untrusted data, and the model is told to ignore any instructions inside it. The model has no tools. It can't run code, browse, or see server secrets.
- Requests are rate-limited (15 per minute per server).

---

## Architecture

```
 Browser (React, client components)                     Server (Next.js route handlers)
 ┌────────────────────────────────────────┐            ┌───────────────────────────────────────────┐
 │ pages: feed, games, players, teams,     │  /api/*    │ providers/espn.ts   ESPN site API parsers │
 │ injuries, stats, fantasy, search, AI    │ ─────────▶ │ providers/feeds.ts  RSS + YouTube Atom    │
 │                                         │   JSON     │ fetcher.ts  timeouts · retry · TTL cache  │
 │ lib/rank.ts  personal ranking+filters   │ ◀───────── │             stale fallback · status ·     │
 │ client/state.ts  localStorage store     │ {data,meta}│             demo fixtures                 │
 │ SWR: dedupe, refresh intervals          │            │ feed.ts  link → cluster → importance      │
 └────────────────────────────────────────┘            │ retrieve.ts + ai.ts  grounded AI          │
                                                        └───────────────────────────────────────────┘
 lib/ (shared, pure, unit-tested): types, classify, entities, cluster, rank, stats, fantasy, nlquery, notify
```

- **Next.js 16 + React 19 + TypeScript + Tailwind 4.** Pages are client components that read from the app's own `/api` routes. External requests and keys stay on the server.
- **Provider layer** (`src/server/providers`). Each source has a fetch function and a parser. Parsers treat responses as untrusted: they use defensive accessors (`src/server/parse.ts`), handle each item separately so one bad item is skipped instead of breaking the list, and throw on the wrong shape. To change a source, only its provider file changes.
- **`fetcher.ts`** owns timeouts (8 s; 5 s for RSS), one retry for network and 5xx errors, an in-memory TTL cache with stale-copy fallback, shared in-flight requests, per-source status for the Settings page, and demo mode.
- **Every response is `{ data, meta }`.** `meta` says whether each source was *live*, *cached* (its last good copy, with the error), *demo* or *unavailable*. The UI shows this next to each section.
- **Feed pipeline** (`server/feed.ts`): ESPN news + RSS + YouTube → link players and teams (from current rosters) → cluster duplicates → score importance. Personal ranking and filtering run in the browser, so they apply instantly.
- **Ranking** (`lib/rank.ts`): `0.35·recency + 0.3·importance + 0.15·credibility + 0.15·personal + 0.05·quality`. Importance comes from rules: a star ruled out, an official trade, a lineup change or a record ranks high, with "why" reasons shown on the card. "Star" means top-40 by ESPN rank in your bundled 2025-26 tier sheet. Engagement counts are never used.
- **Personal data** lives in `localStorage` and survives refreshes. If storage is blocked, everything still works in memory and the UI warns that changes won't persist.
- **Error handling:** each route has an error boundary, and every list has loading, empty and error states.

Project layout:

```
web/
  src/app/            pages + /api route handlers
  src/components/     UI (feed, games, players, ai, shell, charts)
  src/client/         browser state + data hooks
  src/lib/            pure logic shared by server and browser (unit-tested)
  src/server/         providers, fetcher, feed pipeline, AI, demo fixtures
  scripts/make-fixtures.mjs   generates the fictional demo data
  tests/unit/         Vitest
  tests/e2e/          Playwright
```

---

## Data sources

The plan (spec §18) was evaluated with these results. **Bold** = used by the app.

| Source | Provides | Access | Free tier / limits | Freshness | Reliability & terms | If it disappears |
| --- | --- | --- | --- | --- | --- | --- |
| **ESPN site API** (`site.api.espn.com`, `site.web.api.espn.com`) | Scores, box scores, schedules, rosters, standings, injuries, news, player game logs and career stats | Public JSON behind espn.com. No key | No published limits. The app caches: today's scoreboard and open box scores 20–30 s, past days 30 min, rosters 6 h, stats 15 min | Near-real-time scores (typically a minute or so behind TV); injuries are as fresh as ESPN's page | **Undocumented and unofficial.** No published terms for third-party apps. Used here for personal, non-commercial reading with attribution and links back. Can change or vanish without notice. Third-party scrapers reported it working as of mid-2026 ([zuplo guide](https://zuplo.com/learning-center/espn-hidden-api-guide), [sportsapis.dev](https://sportsapis.dev/espn-api)) | Each section falls back to its last good copy (labeled *cached*), then shows *unavailable*. The rest of the app keeps working. Replace `providers/espn.ts` with a licensed feed. |
| **News RSS**: ESPN, CBS Sports, Yahoo Sports, NBC Sports, HoopsHype, RealGM Wiretap | Headlines, short descriptions, links | Public RSS, no key | Polled every 4 min at most | Minutes | RSS is published for syndication. Only headline, description and link are shown, attributed, with a link to the full article. HoopsHype/RealGM are labeled aggregators (not independent). Exact URLs were chosen from publicly advertised feeds but **not live-tested** | A dead feed just drops out; Settings shows the error. Remove it with `DISABLED_SOURCES`. |
| **YouTube channel feeds** (NBA official channel) | Latest videos | Public Atom feed, no key | Polled every 10 min | ~15 min | Embedding via YouTube's player is allowed by YouTube's terms unless the uploader disables it | Highlights section goes empty with an explanation. |
| YouTube Data API v3 | Embeddability check | Free key | 10,000 units/day (the check costs 1 unit per 50 videos) | n/a | Official API | Optional; without it, the player may show YouTube's own "unavailable" message for blocked videos, and a "Watch on YouTube" link is always shown. |
| NBA.com stats / `cdn.nba.com` live data | Rich stats | Undocumented, often blocks non-browser clients | n/a | n/a | Unofficial; terms restrict reuse | **Not used.** |
| Official NBA injury report (PDF) | Official designations | Public PDFs | n/a | Several times a day | Official, but PDF parsing is brittle | **Not used yet.** Injuries come from ESPN's compiled feed and are labeled *Reported*, never *Official*. |
| balldontlie | Teams, players, games; stats on paid tiers | Free key | Free tier is limited | Daily | Official API with terms | Good replacement candidate for players/games if ESPN breaks. |
| Social platforms (X, Reddit) | Reporter posts, community | Paid or restricted APIs | Not free at useful levels | n/a | Terms restrict this use | **Not used.** This also keeps the social noise out. |

The app's actual behavior is visible at **Settings → Data sources**: for each provider, whether its last result was live/cached/demo/unavailable, its last success, last error, request count and failure count since the server started.

---

## What was verified

Being explicit, since the brief asks for it:

- **The build environment had no outbound internet** except package registries. No ESPN, RSS or YouTube endpoint could be called during development, so **no live integration has been verified by a real request**.
- The parsers were written against the response shapes these sources are known to use, and **tested against fixtures in those shapes**: the demo data is generated in ESPN/RSS/Atom format and run through the real parsers. If a live response differs, the defensive parsing skips unknown fields or items, Settings shows the error, and fixing it should only touch one provider file.
- **What to check on first run:** load `/`, then open `/settings#sources`. Every provider should say **live**. If one says *demo* or *unavailable*, its error is listed there.

---

## Tests (actually run)

```bash
npm run lint        # ESLint (Next + React hooks rules) — 0 errors, 0 warnings
npm run typecheck   # tsc — 0 errors
npm test            # Vitest — 82 tests, all passing
npm run build       # production build — succeeds
npm run test:e2e    # build + Playwright (demo mode) — 29 tests, all passing
```

Playwright uses its own Chromium. If `npx playwright install chromium` can't run on your machine, point `PLAYWRIGHT_CHROMIUM_PATH` at a Chrome binary.

**Unit tests** cover text utilities, classification and verification labels, cited-reporter extraction, entity linking (including ambiguous names), clustering (merging, no merging of different developments, an injury update joining its story with the original kept, URL de-duplication, separate highlight clips), importance and personal ranking, composable filters, mutes, stats math (per game, totals, per 36, TS%, eFG%, windows, season labels), fantasy points and bonuses, projections, z-scores, natural-language query parsing, notification de-duplication and quiet hours, every ESPN/RSS/Atom parser (including malformed JSON, wrong shapes, bad items, postponed games, scheduled games never getting scores, `javascript:` links, hostile video ids, HTML in titles), the fetcher (live, cached fallback, demo fallback only for never-working sources, live mode never using demo data, malformed responses, timeouts, shared in-flight requests), AI configuration errors, and prompt-injection containment in source rendering.

**End-to-end tests** cover: home rendering without credentials and labeled as demo; type, team and time filters combined; rapid filter changes; the story reader (sources, timeline, "not official", Escape closes); expanding reports; saves surviving reload; muting; navigation from player chip to profile, team to team page, and game to box score; upcoming games never showing scores or confirmed starters; follows persisting; tab keyboard navigation; natural-language search with removable chips; typo tolerance; empty results; compare intent; the `/` shortcut; comparison values matching the raw game log; the fantasy pool and saved scoring; the honest demo-video state with no fake player; the AI without a provider; AI page context; theme persistence; the source status page; feed API 500s; malformed API JSON; `localStorage` throwing; navigating away mid-request; unknown players; and mobile layout (no horizontal scroll on 7 pages, bottom nav, menu).

**Not tested:** live data from real sources (no network in the build environment), real YouTube playback, real AI provider calls, screen readers (labels, roles and focus were checked, but no screen-reader session), and performance on slow devices. Lighthouse wasn't run.

---

## Limitations

- **Data licensing:** ESPN's JSON is unofficial. Using it for a personal app is common but carries no guarantee. Don't run this as a public or commercial product without licensed data (see roadmap).
- **Injury status history** is recorded by your browser while the app is open. It starts empty and has gaps when the app is closed.
- **Starting lineups:** only *confirmed* (from the box score after tip-off) or *who started the last game* (clearly labeled). There's no free source of projected starters, and the app doesn't guess.
- **In-memory server cache:** restarting the server (or a cold start on Vercel) clears it; the first load after that fetches 30 rosters (a few seconds).
- **Search** covers current players, the current feed window (most recent ~250 stories), and games ±3 days. There's no archive of older news, because nothing is stored server-side.
- **Notifications** only work while the app is open in a tab.
- **Fantasy projections** are a simple, transparent formula (recent form blended with season average, times scheduled games, ±1 SD), not a model.
- **Images:** publisher images and headshots are off by default (Settings → Appearance). Team logos are never used: teams appear as colored abbreviation badges to avoid trademark issues.
- **Unofficial labels:** "Official" comes from official sources or explicit announcement language in the text. The rules are regular expressions in `src/lib/classify.ts` and can misfire; every label links to its sources so you can check.

---

## Roadmap to production

| Item | Status |
| --- | --- |
| Licensed data feeds (Sportradar, Stats Perform, or an official partner) replacing ESPN JSON | Proposed. The provider interfaces are ready for a swap. |
| Persistent storage (SQLite/Postgres) for story history, injury timelines and search archive | Proposed |
| Background ingestion job (cron) instead of fetch-on-request | Proposed |
| Better clustering (embeddings) and original-source detection | Partially implemented (rule-based) |
| Official NBA injury report ingestion (PDF) | Proposed |
| Advanced metrics (usage, on/off, PER) from play-by-play | Proposed |
| Accounts and auth for multi-user use | Proposed (deliberately not built) |
| Push notifications (Web Push + background worker) | Proposed |
| Monitoring and error reporting (e.g. Sentry free tier), uptime checks | Proposed |
| CI running lint, types, unit and e2e on each push | Proposed (commands exist) |
| Accessibility audit with screen readers; Lighthouse/perf budget | Proposed |
| Security review (rate limiting per user, CSP, dependency audit) | Partially (security headers, server-only keys, sanitized output, AI rate limit) |
| Licensing review of every source; deployment and backup procedures | Proposed |

Suggested next steps:
1. Run it locally and confirm every source shows **live** in Settings.
2. Pick an AI provider (Groq is free) and try the analyst on a player page.
3. Add official injury-report ingestion so availability can be labeled *Official*.
4. Add a small SQLite store so story timelines and injury history survive restarts.
