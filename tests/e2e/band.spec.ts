import { test, expect } from "@playwright/test";
import { createEvent, deleteEvent, registerBand, scan, testUid, goLive, loginAs, OTP, FAN_STATE, PHONES } from "./helpers";

test.describe("Band tap page", () => {
  test("unknown band shows friendly error", async ({ page }) => {
    await page.goto("/b/04E2EUNKNOWN9");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/unknown band/i);
    await expect(page.getByRole("link", { name: /^sign in$/i })).toBeVisible();
  });

  test("garbage uid handled", async ({ page }) => {
    await page.goto("/b/%3Cscript%3E");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/unknown band/i);
  });

  test("unclaimed band: preview points and activities, claim with phone + code", async ({ page, request }) => {
    const ev = await createEvent(request, { name: `E2E Claim ${Date.now()}` });
    const uid = testUid();
    try {
      await registerBand(request, uid, ev.id);
      await scan(request, uid, ev.activities.find((a) => a.name === "Entry")!.id);
      await scan(request, uid, ev.activities.find((a) => a.name === "Merch Booth")!.id);

      await page.goto(`/b/${uid}`);
      await expect(page.getByText(/band points/i)).toBeVisible();
      await expect(page.getByText("150", { exact: true })).toBeVisible();
      await expect(page.getByText(/^activities$/i)).toBeVisible();
      await expect(page.getByText("2", { exact: true })).toBeVisible();
      await expect(page.getByText("Merch Booth")).toBeVisible();

      await page.getByPlaceholder("Phone number").fill(PHONES.sam);
      await page.getByRole("button", { name: /^claim$/i }).click();
      await page.getByPlaceholder("Code").fill(OTP);
      await page.getByRole("button", { name: /confirm/i }).click();
      await expect(page).toHaveURL(/\/dashboard\?claimed=1/);
      await expect(page.getByText(/band claimed/i)).toBeVisible();

      // tapping again as owner goes straight to dashboard
      await page.goto(`/b/${uid}`);
      await expect(page).toHaveURL(/\/dashboard/);
    } finally {
      await deleteEvent(request, ev.id);
    }
  });

  test("claimed band, not signed in → login prompt; another fan → belongs to someone else", async ({ page, request, browser }) => {
    const ev = await createEvent(request, { name: `E2E Other ${Date.now()}` });
    const uid = testUid();
    try {
      await registerBand(request, uid, ev.id);
      // claim as the test fan using the saved session (no OTP needed)
      const ctx = await browser.newContext({ storageState: FAN_STATE });
      expect((await ctx.request.post("/api/claim", { data: { uid } })).ok()).toBeTruthy();
      await ctx.close();

      await page.goto(`/b/${uid}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/already claimed/i);
      await expect(page.getByRole("link", { name: /sign in with phone/i })).toHaveAttribute("href", `/login?next=/b/${uid}`);

      await loginAs(page, PHONES.maya, `/b/${uid}`);
      await expect(page.getByText(/sign in with the number that claimed it/i)).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });

  test("live station: unknown band auto-registers and logs a scan; signed-in fan can add to account", async ({ page, request, browser }) => {
    const ev = await createEvent(request, { name: `E2E Live ${Date.now()}` });
    const uid = testUid();
    try {
      await goLive(request, ev.id, ev.activities.find((a) => a.name === "Entry")!.id);
      await page.goto(`/b/${uid}`);
      await expect(page.getByText(/\+50 pts · Entry/)).toBeVisible();
      await expect(page.getByText("50", { exact: true })).toBeVisible();
      await page.goto(`/b/${uid}`);
      await expect(page.getByText(/already tapped in at entry/i)).toBeVisible();

      const ctx = await browser.newContext({ storageState: FAN_STATE });
      const fan = await ctx.newPage();
      await fan.goto(`/b/${uid}`);
      await fan.getByRole("button", { name: /add to my account/i }).click();
      await expect(fan).toHaveURL(/\/dashboard\?claimed=1/);
      await ctx.close();
    } finally {
      await goLive(request, ev.id, null);
      await deleteEvent(request, ev.id);
    }
  });
});
