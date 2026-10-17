import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FAN_STATE } from "./helpers";

/** Fails on serious/critical WCAG issues; logs everything else as UX gaps. */
async function audit(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of results.violations) {
    console.log(`[a11y][${label}] ${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}`);
    if (v.impact === "serious" || v.impact === "critical")
      for (const n of v.nodes.slice(0, 3)) console.log(`   ${n.target.join(" ")} :: ${n.html.slice(0, 140)}`);
  }
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
}

test.describe("Accessibility", () => {
  test("public pages", async ({ page }) => {
    for (const p of ["/", "/login", "/b/04E2EUNKNOWN9", "/staff", "/admin", "/artist"]) {
      await page.goto(p);
      await audit(page, p);
    }
  });

  test("fan pages", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: FAN_STATE });
    const page = await ctx.newPage();
    for (const p of ["/dashboard", "/concerts", "/leaderboard", "/marketplace", "/profile"]) {
      await page.goto(p);
      await audit(page, p);
    }
    await page.goto("/concerts");
    await page.getByRole("link", { name: /our lady peace/i }).first().click();
    await audit(page, "/concerts/[id]");
    await ctx.close();
  });
});
