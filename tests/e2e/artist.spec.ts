import { test, expect } from "@playwright/test";
import { OLP_CODE, createEvent, deleteEvent, deleteArtist, registerBand, testUid, FAN_STATE } from "./helpers";

async function open(page: import("@playwright/test").Page, code = OLP_CODE) {
  await page.goto("/artist");
  await page.getByPlaceholder("e.g. OLP2026").fill(code);
  await page.getByRole("button", { name: /open console/i }).click();
}

test.describe("Artist console", () => {
  test("wrong code rejected; right code shows stats and top fans with socials", async ({ page }) => {
    await open(page, "nope");
    await expect(page.getByText(/wrong access code/i)).toBeVisible();
    await open(page);
    await expect(page.getByRole("heading", { name: /our lady peace/i })).toBeVisible();
    await expect(page.getByText(/^fans$/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /top fans/i })).toBeVisible();
    await expect(page.getByText(/ig @maya\.rae/i)).toBeVisible();
    await expect(page.getByText(/no socials linked/i).first()).toBeVisible();
  });

  test("select top 5, send inbox message, see it in log", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^top 5$/i }).click();
    await expect(page.getByText(/clear 5/i)).toBeVisible();
    await page.getByRole("button", { name: /^message/i }).click();
    await expect(page.getByText(/5 selected/i)).toBeVisible();
    await page.getByRole("button", { name: /inbox only/i }).click();
    const body = `E2E message ${Date.now()}`;
    await page.getByPlaceholder(/thanks for coming out tonight/i).fill(body);
    await page.getByRole("button", { name: /send to 5 fans/i }).click();
    await expect(page.getByText(/sent to 5 fans/i)).toBeVisible();
    await page.getByRole("button", { name: /^log$/i }).click();
    await expect(page.getByText(body).first()).toBeVisible();
  });

  test("drop quick pick to top 1 shows in log", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^drop/i }).click();
    await page.getByRole("button", { name: /^top 1$/i }).click();
    await page.getByRole("button", { name: /signed poster/i }).click();
    await expect(page.getByPlaceholder("Soundcheck pass")).toHaveValue("Signed poster");
    await page.getByRole("button", { name: /drop to 1 fan$/i }).click();
    await expect(page.getByText(/dropped to 1 fan/i)).toBeVisible();
    await page.getByRole("button", { name: /^log$/i }).click();
    await expect(page.getByText("Signed poster").first()).toBeVisible();
  });

  test("social: fan submits, artist approves, points land in that artist's pool", async ({ page, request, browser }) => {
    const artistName = `E2E Approve ${Date.now()}`;
    const ev = await createEvent(request, {
      name: `E2E Approve Ev ${Date.now()}`,
      new_artist: { name: artistName },
      activities: [{ name: "Entry", points: 50 }, { name: "Post on Instagram", points: 150, kind: "social", social_network: "instagram" }],
    });
    const uid = testUid();
    try {
      const code = (await (await request.post("/api/admin/artists", { headers: { "x-staff-pin": "1234", "content-type": "application/json" }, data: { name: artistName } })).json()).artist.access_code;

      // fan: claim band + submit post, using the saved Demo Fan session
      const ctx = await browser.newContext({ storageState: FAN_STATE });
      const fan = await ctx.newPage();
      await registerBand(request, uid, ev.id);
      expect((await fan.request.post("/api/claim", { data: { uid } })).ok()).toBeTruthy();
      const social = ev.activities.find((a) => a.kind === "social")!;
      expect((await fan.request.post("/api/social", { data: { activity_id: social.id, url: "https://instagram.com/p/e2e" } })).ok()).toBeTruthy();

      // artist approves in UI
      await open(page, code);
      await page.getByRole("button", { name: /^social/i }).click();
      await expect(page.getByText(/post on instagram · \+150 pts/i)).toBeVisible();
      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect(page.getByText(/approved, points awarded/i)).toBeVisible();
      await expect(page.getByText(/nothing waiting/i)).toBeVisible();

      // fan sees 150 in the pool and Done on the show page
      await fan.goto(`/concerts/${ev.id}`);
      await expect(fan.getByText(/150 \/ 200 pts/)).toBeVisible();
      await expect(fan.getByText(/^done$/i).first()).toBeVisible();
      await fan.goto("/leaderboard");
      await fan.getByRole("link", { name: artistName }).click();
      await expect(fan.getByText(/^you$/i)).toBeVisible();
      await ctx.close();
    } finally {
      await deleteEvent(request, ev.id);
      if (ev.artist_id) await deleteArtist(request, ev.artist_id);
    }
  });
});
