import { test, expect } from "@playwright/test";
import { loginAs, PHONES } from "./helpers";

test.describe("Public pages", () => {
  test("home shows CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/your wristband/i);
    await expect(page.getByRole("link", { name: /sign in with phone/i })).toBeVisible();
  });

  test("protected pages redirect to login with next", async ({ page }) => {
    for (const p of ["/dashboard", "/concerts", "/leaderboard", "/marketplace", "/profile"]) {
      await page.goto(p);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(p)}`));
    }
  });

  test("login validates phone and code; wrong code shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Phone number").fill("123");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/valid phone/i)).toBeVisible();
    await page.getByPlaceholder("Phone number").fill(PHONES.priya);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/code sent to \+15550100003/i)).toBeVisible();
    await page.getByPlaceholder("Code").fill("000000");
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByText(/invalid|expired/i)).toBeVisible();
    await page.getByRole("button", { name: /different number/i }).click();
    await expect(page.getByPlaceholder("Phone number")).toBeVisible();
  });

  test("login round trip lands on dashboard and sign out returns to login", async ({ page }) => {
    await loginAs(page, PHONES.leo); // own number: sign-out revokes every session for that user
    await expect(page.getByText(/^leo$/i)).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("theme toggle persists across reload", async ({ page }) => {
    await page.goto("/login");
    const html = page.locator("html");
    await page.getByRole("button", { name: /toggle theme/i }).click();
    const t = await html.getAttribute("data-theme");
    expect(["light", "dark"]).toContain(t);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", t!);
  });

  test("no horizontal overflow on phone width", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
});
