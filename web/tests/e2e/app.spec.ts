import { expect, test } from "@playwright/test";

test.describe("home feed", () => {
  test("renders without credentials, clearly labeled as demo data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Demonstration data.").first()).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Today's scoreboard" }).getByRole("link").first()).toBeVisible();
    // every story card carries the DEMO badge
    const cards = page.locator("article");
    const n = await cards.count();
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i++) await expect(cards.nth(i).getByText("Demo", { exact: true })).toBeVisible();
  });

  test("type filter shows only that type; composable with team + time filters", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Injuries", exact: true }).click();
    const cards = page.locator("article");
    await expect(cards.first()).toBeVisible();
    for (const t of await cards.allInnerTexts()) expect(t).toMatch(/INJURIES/i);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByLabel("Teams").selectOption({ label: "New York Knicks" });
    await page.getByLabel("Time range").selectOption({ label: "Last 48 hours" });
    await expect(page.getByRole("button", { name: "Remove filter New York Knicks" })).toBeVisible();
    for (const t of await cards.allInnerTexts()) expect(t).toMatch(/NYK/);
    // A team with no injury stories → empty state, then clear all restores the feed.
    await page.getByRole("button", { name: "Remove filter New York Knicks" }).click();
    await page.getByLabel("Teams").selectOption({ label: "Utah Jazz" });
    await expect(page.getByText("No stories match")).toBeVisible();
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(cards.first()).toBeVisible();
  });

  test("rapid filter changes settle on the last selection", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("article").first()).toBeVisible();
    for (const name of ["Injuries", "Transactions", "Highlights", "Rumors", "Transactions"]) {
      await page.getByRole("button", { name, exact: true }).click();
    }
    // Transactions toggled twice → off; Injuries, Highlights, Rumors remain on.
    for (const t of await page.locator("article").allInnerTexts()) expect(t).toMatch(/INJURIES|HIGHLIGHTS|RUMORS|INTERVIEWS/i);
  });

  test("story details: in-app reader with sources, timestamps and timeline; Escape closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Thunder agree to trade/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("How sure is this?")).toBeVisible();
    await expect(dialog.getByText(/Timeline \(4 reports\)/)).toBeVisible();
    await expect(dialog.getByText("several outlets reporting does not make it official", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Read full article at ESPN/ })).toHaveAttribute("target", "_blank");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/story=/);
  });

  test("expand shows every report with its own time and source", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("article", { hasText: "Thunder agree to trade" });
    await card.getByRole("button", { name: /Show 3 more reports/ }).click();
    await expect(card.getByText("Read at CBS Sports")).toBeVisible();
    await expect(card.getByText("aggregator")).toBeVisible();
  });

  test("saved stories persist after refresh", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("article", { hasText: "Thunder agree to trade" });
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await page.goto("/saved");
    await expect(page.locator("main").getByRole("link", { name: /Thunder agree to trade/ }).first()).toBeVisible();
  });

  test("muting a category from a card hides it", async ({ page }) => {
    await page.goto("/");
    const rumor = page.locator("article", { hasText: "backup center" });
    await rumor.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Mute “Rumors” stories/ }).click();
    await expect(page.locator("article", { hasText: "backup center" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Rumors" }).nth(1)).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("navigation", () => {
  test("player chip → profile; team badge → team page; game card → box score", async ({ page }) => {
    await page.goto("/");
    await page.locator("article", { hasText: "Thunder agree to trade" }).getByRole("link", { name: "Nico Arrowsmith", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Nico Arrowsmith" })).toBeVisible();
    await page.getByRole("link", { name: /Miami Heat/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Miami Heat" })).toBeVisible();
    await page.goto("/games");
    await page.locator("main").getByRole("link", { name: /live/ }).first().click();
    await expect(page.getByText(/box score/).first()).toBeVisible();
    await expect(page.getByText("Confirmed: marked as starters in the box score.")).toBeVisible();
  });

  test("upcoming game never shows a score or claims confirmed starters", async ({ page }) => {
    await page.goto("/games");
    const upcoming = page.locator("main").getByRole("link", { name: /starts/ }).first();
    await upcoming.click();
    await expect(page.getByText("Not yet confirmed").first()).toBeVisible();
    await expect(page.getByText("Confirmed: marked as starters")).toHaveCount(0);
  });

  test("follow a team persists and appears in the sidebar", async ({ page }) => {
    await page.goto("/teams/18");
    await page.getByRole("button", { name: "Follow" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Knicks/ })).toBeVisible();
  });

  test("follow a player from the profile → watchlist", async ({ page }) => {
    await page.goto("/players/9001");
    await page.getByRole("button", { name: "Follow" }).click();
    await page.goto("/saved");
    await expect(page.locator("main").getByRole("link", { name: "Darius Vantrell" })).toBeVisible();
  });

  test("player tabs and keyboard arrows", async ({ page }) => {
    await page.goto("/players/9001");
    await page.getByRole("tab", { name: "Overview" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Game log" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("table").first()).toBeVisible();
    await page.getByRole("tab", { name: "Availability" }).click();
    await expect(page.getByText(/not the league's official injury report/)).toBeVisible();
  });
});

test.describe("search", () => {
  test("natural-language query shows interpreted filters and real results; chips are removable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search" }).fill("Knicks injuries last 3 days");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("button", { name: "Remove filter New York Knicks" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter Last 3 days" })).toBeVisible();
    await expect(page.locator("article", { hasText: "Vantrell" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Remove filter injury" }).click();
    await expect(page).toHaveURL(/ignore=types/);
    await expect(page.getByRole("button", { name: "Restore filters" })).toBeVisible();
  });

  test("typos still find players; empty results explain why", async ({ page }) => {
    await page.goto("/search?q=vantrel");
    await expect(page.getByRole("link", { name: /Darius Vantrell/ }).first()).toBeVisible();
    await page.goto("/search?q=zzzqqq");
    await expect(page.getByText(/No results for/)).toBeVisible();
  });

  test("compare intent links to the comparison", async ({ page }) => {
    await page.goto("/search?q=" + encodeURIComponent("compare Darius Vantrell and Rowan Castellane"));
    await page.getByRole("link", { name: /Open the comparison/ }).click();
    await expect(page.getByRole("columnheader", { name: /Rowan Castellane/ })).toBeVisible();
  });

  test("'/' focuses the search box", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
  });
});

test.describe("stats & fantasy", () => {
  test("comparison table values are computed from the game log", async ({ page, request }) => {
    const res = await request.get("/api/players/9001");
    const log = (await res.json()).data.stats.log.filter((g: { seasonType: string; min: number }) => g.seasonType === "regular" && g.min > 0);
    const ppg = log.reduce((a: number, g: { pts: number }) => a + g.pts, 0) / log.length;
    await page.goto("/stats?players=9001,9008");
    const row = page.getByRole("row", { name: /^PTS/ });
    await expect(row).toContainText(ppg.toFixed(1));
    await page.getByRole("button", { name: "Totals" }).click();
    await expect(page.getByRole("row", { name: /^PTS/ })).toContainText(String(log.reduce((a: number, g: { pts: number }) => a + g.pts, 0)));
  });

  test("fantasy pool, scoring edits persist, projections labeled as estimates", async ({ page }) => {
    await page.goto("/players/9008");
    await page.getByRole("button", { name: "Add to fantasy pool" }).click();
    await page.goto("/fantasy");
    await expect(page.getByRole("rowheader", { name: /Rowan Castellane/ })).toBeVisible();
    await page.getByLabel("Steals").fill("5");
    await page.reload();
    await expect(page.getByLabel("Steals")).toHaveValue("5");
    await page.goto("/players/9008");
    await page.getByRole("tab", { name: "Fantasy" }).click();
    await expect(page.getByText("Projection (estimate, not a fact)")).toBeVisible();
  });
});

test.describe("video, AI, settings", () => {
  test("demo videos show an honest no-video state, never a fake player", async ({ page }) => {
    await page.goto("/highlights");
    await expect(page.getByText("Demo item — there is no real video behind it.").first()).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Play video/ })).toHaveCount(0);
  });

  test("AI analyst without a provider explains setup and still shows the sources it found", async ({ page }) => {
    await page.goto("/ai");
    await page.getByRole("button", { name: "What is the biggest NBA news today?" }).click();
    await expect(page.getByText("The AI analyst isn't set up yet.")).toBeVisible();
    await expect(page.getByText(/Sources \(\d+\)/)).toBeVisible();
  });

  test("AI uses page context", async ({ page }) => {
    await page.goto("/players/9001");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByPlaceholder("Ask about Darius Vantrell…")).toBeVisible();
  });

  test("theme setting persists", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: "Light theme" }).check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("data source status page reports demo mode honestly", async ({ page }) => {
    await page.goto("/");
    await page.goto("/settings#sources");
    await expect(page.getByText(/Data mode:/)).toBeVisible();
    await expect(page.getByText("fictional demo data only")).toBeVisible();
  });
});

test.describe("failure handling", () => {
  test("feed API error → error state with retry; the rest of the page still works", async ({ page }) => {
    await page.route("**/api/feed", (r) => r.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }), contentType: "application/json" }));
    await page.goto("/");
    await expect(page.getByText("Couldn't load the news feed.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Today's scoreboard" }).getByRole("link").first()).toBeVisible();
  });

  test("malformed JSON from the API is handled", async ({ page }) => {
    await page.route("**/api/injuries", (r) => r.fulfill({ status: 200, body: "{not json", contentType: "application/json" }));
    await page.goto("/injuries");
    await expect(page.getByText("Couldn't load injuries.")).toBeVisible();
  });

  test("works when localStorage throws (private mode)", async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException("denied", "SecurityError");
      };
      Object.defineProperty(window, "localStorage", { get: () => ({ getItem: boom, setItem: boom, removeItem: boom, key: boom, length: 0 }) });
    });
    await page.goto("/");
    await expect(page.locator("article").first()).toBeVisible();
    await page.locator("article").first().getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("link", { name: "Saved & watchlist" }).click();
    await expect(page.getByText(/blocking local storage/)).toBeVisible();
  });

  test("navigating away while a request is pending doesn't break the next page", async ({ page }) => {
    await page.route("**/api/players/9001**", async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await page.goto("/players/9001");
    await page.getByRole("link", { name: "Teams", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
    await page.waitForTimeout(1700);
    await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  });

  test("unknown player id → not-found state, not a crash", async ({ page }) => {
    await page.goto("/players/123456");
    await expect(page.getByText("Player not found or source unavailable")).toBeVisible();
  });
});
