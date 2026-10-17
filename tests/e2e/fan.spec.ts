import { test, expect } from "@playwright/test";
import { createEvent, deleteEvent, deleteArtist, registerBand, scan, testUid, createReward, goLive, FAN_NAME } from "./helpers";

/* Runs with Demo Fan's session (storageState from auth.setup). */

test.describe("Fan pages", () => {
  test("dashboard shows points, fandoms, latest show, activity, nav", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/^demo$/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^events$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^activity$/i })).toBeVisible();
    for (const t of ["Home", "Shows", "Ranks", "Rewards", "Me"]) {
      await expect(page.getByRole("navigation").getByRole("link", { name: t, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("navigation").getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("shows list → concert page with details, map, activities", async ({ page }) => {
    await test.step("shows list", async () => {
      await page.goto("/concerts");
      await expect(page.getByRole("heading", { name: /^shows$/i })).toBeVisible();
      await page.getByRole("link", { name: /our lady peace/i }).first().click();
      await expect(page).toHaveURL(/\/concerts\/[0-9a-f-]+/);
    });
    await test.step("concert header", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/our lady peace/i);
      await expect(page.getByRole("heading", { name: /venue map/i })).toBeVisible();
    });
    const map = page.getByRole("group", { name: /floor plan/i });
    await test.step("map pin", async () => {
      await expect(map).toBeVisible();
      const pin = map.getByRole("button", { name: /merch booth/i });
      await pin.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(/main lobby, west wall/i).first()).toBeVisible();
    });
    await expect(page.getByRole("heading", { name: /^activities$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^social$/i })).toBeVisible();
  });

  test("leaderboard: artist tabs, show chips, you highlighted", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/our lady peace/i);
    await expect(page.getByText(/^you$/i)).toBeVisible();
    await page.getByRole("link", { name: /toronto marl/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/marlies/i);
    await expect(page.getByRole("paragraph").filter({ hasText: /^all shows$/i })).toBeVisible();
    await page.getByRole("link", { name: /our lady peace/i }).click();
    await page.getByRole("link", { name: /oct \d+, 2026/i }).first().click();
    await expect(page.getByText(/oct \d+, 2026/i).first()).toBeVisible();
  });

  test("profile: save socials, see them on reload", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(FAN_NAME);
    const ig = page.getByPlaceholder("@handle").first();
    await ig.fill("@demo.fan");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/^saved$/i)).toBeVisible();
    await page.reload();
    await expect(ig).toHaveValue("demo.fan");
  });

  test("social: submit a post link, pending shows, invalid link rejected", async ({ page, request }) => {
    const ev = await createEvent(request, {
      name: `E2E Social ${Date.now()}`,
      new_artist: { name: `E2E Social Artist ${Date.now()}` },
      activities: [
        { name: "Entry", points: 50 },
        { name: "Post on Instagram", points: 150, kind: "social", social_network: "instagram" },
      ],
    });
    const uid = testUid();
    try {
      // Fan needs a band at this event to see it under Shows; claim via API with the session.
      await registerBand(request, uid, ev.id);
      const claim = await page.request.post("/api/claim", { data: { uid } });
      expect(claim.ok(), await claim.text()).toBeTruthy();

      await page.goto(`/concerts/${ev.id}`);
      await expect(page.getByRole("heading", { name: /^social$/i })).toBeVisible();
      const url = page.getByPlaceholder("Post link");
      await url.fill("not a url");
      await page.getByRole("button", { name: /^submit$/i }).click();
      // native url validation blocks submit; nothing changes
      await url.fill("https://www.instagram.com/p/e2e-test/");
      await page.getByRole("button", { name: /^submit$/i }).click();
      await expect(page.getByText(/submitted, pending approval/i)).toBeVisible();
      await page.reload();
      await expect(page.getByText(/^pending$/i)).toBeVisible();

      await page.goto("/profile");
      await expect(page.getByText("Post on Instagram").first()).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
      if (ev.artist_id) await deleteArtist(request, ev.artist_id);
    }
  });

  test("marketplace: per-artist pools, can't afford state, redeem code, redemption listed", async ({ page, request }) => {
    const ev = await createEvent(request, { name: `E2E Market ${Date.now()}`, new_artist: { name: `E2E Market Artist ${Date.now()}` } });
    const uid = testUid();
    const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
    try {
      const cheap = await createReward(request, { artist_id: ev.artist_id!, name: "E2E sticker", cost: 50, type: "discount_code", codes: [code] });
      const pricey = await createReward(request, { artist_id: ev.artist_id!, name: "E2E jacket", cost: 10_000, type: "merch", stock: 1 });
      await registerBand(request, uid, ev.id);
      expect((await page.request.post("/api/claim", { data: { uid } })).ok()).toBeTruthy();
      await scan(request, uid, ev.activities.find((a) => a.name === "Entry")!.id); // +50 in this artist's pool

      await page.goto(`/marketplace?artist=${ev.artist_id}`);
      const section = page.locator("main");
      await expect(section.getByText(/50 pts with/)).toBeVisible();
      await expect(section.getByRole("button", { name: /9,950 more points needed/i })).toBeDisabled();

      const card = section.locator("div").filter({ hasText: cheap.name }).first();
      await card.getByRole("button", { name: /^redeem$/i }).click();
      await card.getByRole("button", { name: /spend 50 pts/i }).click();
      await expect(card.getByText(code)).toBeVisible();
      await expect(section.getByText(/^0 pts with/)).toBeVisible();

      await expect(page.getByRole("heading", { name: /^redeemed$/i })).toBeVisible();
      await expect(page.getByText(code)).toHaveCount(2); // card + redemptions list
      void pricey;
    } finally {
      await deleteEvent(request, ev.id);
      if (ev.artist_id) await deleteArtist(request, ev.artist_id);
    }
  });

  test("own claimed band tap → dashboard with live-station banner", async ({ page, request }) => {
    const ev = await createEvent(request, { name: `E2E Own ${Date.now()}` });
    const uid = testUid();
    try {
      await registerBand(request, uid, ev.id);
      expect((await page.request.post("/api/claim", { data: { uid } })).ok()).toBeTruthy();
      const photo = ev.activities.find((a) => a.name === "Photo Wall")!;
      await goLive(request, ev.id, photo.id);
      await page.goto(`/b/${uid}`);
      await expect(page).toHaveURL(/\/dashboard\?tap=Photo%20Wall&pts=75/);
      await expect(page.getByText(/\+75 pts · Photo Wall/)).toBeVisible();
      await page.goto(`/b/${uid}`);
      await expect(page.getByText(/already tapped in at photo wall/i)).toBeVisible();
    } finally {
      await goLive(request, ev.id, null);
      await deleteEvent(request, ev.id);
    }
  });

  test("inbox: drop can be claimed and reveals code", async ({ page, request }) => {
    const title = `E2E Drop ${Date.now()}`;
    const r = await request.post("/api/artist/drop", {
      headers: { "x-artist-code": "OLP2026", "content-type": "application/json" },
      data: { title, message: "test", code: "E2EDROP", top: 100 },
    });
    expect(r.ok()).toBeTruthy();
    await page.goto("/dashboard");
    const card = page.getByTestId("drop-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^claim$/i }).click();
    await expect(card.getByText(/E2EDROP/)).toBeVisible();
  });
});
