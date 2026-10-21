import { expect, test } from "@playwright/test";

test("mobile: bottom nav, menu, no horizontal scroll", async ({ page }) => {
  for (const path of ["/", "/players/9001", "/stats?players=9001,9008", "/games", "/teams/18", "/fantasy", "/injuries"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  const bottom = page.getByRole("navigation", { name: "Primary" });
  await expect(bottom).toBeVisible();
  await bottom.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "Injuries & lineups" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Injuries & lineups" })).toBeVisible();
  await expect(menu).toBeHidden();
});
