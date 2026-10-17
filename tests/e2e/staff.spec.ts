import { test, expect } from "@playwright/test";
import { PIN, createEvent, deleteEvent, testUid } from "./helpers";

test.describe("Staff station", () => {
  test("PIN gate rejects wrong, accepts right, remembers, locks", async ({ page }) => {
    await page.goto("/staff");
    await page.getByPlaceholder("••••").fill("0000");
    await page.getByRole("button", { name: /unlock/i }).click();
    await expect(page.getByText(/wrong pin/i)).toBeVisible();
    await page.getByPlaceholder("••••").fill(PIN);
    await page.getByRole("button", { name: /unlock/i }).click();
    await expect(page.getByRole("heading", { name: /scan station/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /scan station/i })).toBeVisible();
    await page.getByRole("button", { name: /^lock$/i }).click();
    await expect(page.getByPlaceholder("••••")).toBeVisible();
  });

  test("manual tap shows overlay, duplicate shows Done, log fills", async ({ page, request }) => {
    const ev = await createEvent(request, { name: `E2E Staff ${Date.now()}` });
    const uid = testUid();
    try {
      await page.goto("/staff");
      await page.getByPlaceholder("••••").fill(PIN);
      await page.getByRole("button", { name: /unlock/i }).click();
      await page.getByRole("combobox").selectOption(ev.id);
      await page.getByRole("button", { name: /merch booth/i }).click();
      await expect(page.getByText(/no nfc in this browser/i)).toBeVisible();
      await page.getByPlaceholder("Band UID").fill(uid);
      await page.getByRole("button", { name: /^log$/i }).click();
      const overlay = page.getByRole("paragraph").filter({ hasText: /^\+100$/ });
      await expect(overlay).toBeVisible();
      await expect(page.getByText(/unclaimed band · points saved/i)).toBeVisible();
      await overlay.click(); // dismiss overlay
      await page.getByPlaceholder("Band UID").fill(uid);
      await page.getByRole("button", { name: /^log$/i }).click();
      await expect(page.getByText(/^done$/i).first()).toBeVisible();
      await expect(page.locator("text=" + uid).first()).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });
});
