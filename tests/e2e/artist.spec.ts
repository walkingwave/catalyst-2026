import { test, expect } from "@playwright/test";
import { OLP_CODE, createEvent, deleteEvent, deleteArtist, registerBand, testUid, FAN_STATE } from "./helpers";

async function open(page: import("@playwright/test").Page, code = OLP_CODE) {
  await page.goto("/artist");
  await page.getByPlaceholder("Access code").fill(code);
  await page.getByRole("button", { name: /unlock/i }).click();
}

test.describe("Artist console", () => {
  test("wrong code rejected; right code shows stats and top fans with socials", async ({ page }) => {
    await open(page, "nope");
    await expect(page.getByText(/wrong access code/i)).toBeVisible();
    await open(page);
    await expect(page.getByRole("heading", { name: /our lady peace/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /\d+ fans?$/i })).toBeVisible();
    await expect(page.getByText(/ig @maya\.rae/i)).toBeVisible();
    await expect(page.getByText(/no socials/i).first()).toBeVisible();
    // search narrows the list
    await page.getByPlaceholder("Search name or @handle").fill("maya");
    await expect(page.getByRole("heading", { name: /^1 fan$/i })).toBeVisible();
    await page.getByPlaceholder("Search name or @handle").fill("");
    // fan sheet opens with history
    await page.getByRole("button", { name: /maya r\./i }).first().click();
    await expect(page.getByTestId("fan-sheet")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^taps$/i })).toBeVisible();
    await page.getByRole("button", { name: /^fans$/i }).first().click();
    await expect(page.getByTestId("fan-sheet")).toBeHidden();
  });

  test("select top 3 by number, checkboxes, send inbox message, see it in log", async ({ page }) => {
    await open(page);
    await page.getByPlaceholder("10").fill("3");
    await page.getByRole("button", { name: /^go$/i }).click();
    await expect(page.getByText(/^3 selected$/i)).toBeVisible();
    // uncheck one via its checkbox, then re-check
    await page.getByRole("button", { name: /^unselect$/i }).first().click();
    await expect(page.getByText(/^2 selected$/i)).toBeVisible();
    await page.getByRole("button", { name: /^select$/i }).first().click();
    await expect(page.getByText(/^3 selected$/i)).toBeVisible();
    await page.getByRole("button", { name: /^message$/i }).last().click();
    await expect(page.getByText(/to · 3 fans/i)).toBeVisible();
    await page.getByRole("button", { name: /inbox only/i }).click();
    const body = `E2E message ${Date.now()}`;
    await page.getByPlaceholder("Message").fill(body);
    await page.getByRole("button", { name: /send to 3 fans/i }).click();
    await expect(page.getByText(/sent to 3 fans/i)).toBeVisible();
    await page.getByRole("button", { name: /^log$/i }).click();
    await expect(page.getByText(body).first()).toBeVisible();
  });

  test("save a custom drop, send it to top 1, see it in log, delete template", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^drop$/i }).click();
    const title = `E2E Drop ${Date.now()}`;
    await page.getByPlaceholder("Title").fill(title);
    await page.getByPlaceholder("Message").fill("test");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/saved as a drop/i)).toBeVisible();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    // recipients: top 1 via the inline control
    const top = page.locator('input[inputmode="numeric"]').first();
    await top.fill("1");
    await page.getByRole("button", { name: /^set$/i }).click();
    await expect(page.getByText(/to · 1 fan$/i)).toBeVisible();
    await page.getByRole("button", { name: /drop to 1 fan$/i }).click();
    await expect(page.getByText(/dropped to 1 fan/i)).toBeVisible();
    await page.getByRole("button", { name: /^log$/i }).click();
    await expect(page.getByText(title).first()).toBeVisible();
    await page.getByRole("button", { name: /^drop$/i }).click();
    await page.getByRole("button", { name: `Delete ${title}` }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeHidden();
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
      await page.getByRole("button", { name: /^review/i }).click();
      await expect(page.getByText(/post on instagram · \+150 pts/i)).toBeVisible();
      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect(page.getByText(/approved, points awarded/i)).toBeVisible();
      await expect(page.getByText(/nothing to review/i)).toBeVisible();

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

test.describe("SMS delivery feedback", () => {
  // Mock the artist APIs so these UI regressions cannot text real fans or alter demo data.
  async function mockConsole(page: import("@playwright/test").Page, enabled: boolean) {
    await page.route("**/api/artist/verify", (route) => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/artist/overview", (route) => route.fulfill({ json: {
      artist: { id: "artist", name: "Test Artist", kind: "artist" },
      sms_enabled: enabled, stats: { fans: 1, shows: 1, pending_posts: 0 },
      top_fans: [{ user_id: "fan", name: "Test Fan", rank: 1, points: 10, shows: 1, has_phone: true }],
      concerts: [], pending_posts: [], messages: [], drops: [],
      templates: [{ id: "template", title: "Saved gift", message: "A gift for you", code_prefix: "GIFT" }],
    } }));
    await page.route("**/api/artist/fan?*", (route) => route.fulfill({ json: { fan: {
      id: "fan", name: "Test Fan", has_phone: true, phone_hint: "···0001",
      points: { earned: 10, spent: 0, balance: 10 }, shows: [], scans: [], messages: [], drops: [],
    } } }));
    await open(page);
    await expect(page.getByRole("heading", { name: "Test Artist" })).toBeVisible();
  }

  test("shows SMS failure separately from inbox success and makes drop SMS optional", async ({ page }) => {
    await mockConsole(page, true);
    await page.route("**/api/artist/message", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ channel: "sms", body: "SMS UI test" });
      await route.fulfill({ json: {
        ok: true, sent: 1, live: true,
        delivery: { inbox: 1, inbox_failed: 0, sms_sent: 0, sms_failed: 1, sms_skipped: 0, status_failed: 0 },
      } });
    });
    await page.getByRole("button", { name: /^message/i }).click();
    await page.getByRole("button", { name: /^set$/i }).click();
    await expect(page.getByText(/SMS is available/)).toBeVisible();
    await page.getByPlaceholder("Message").fill("SMS UI test");
    await page.getByRole("button", { name: /send to 1 fan$/i }).click();
    await expect(page.getByRole("status")).toContainText("Sent to 1 fan in the inbox.");
    await expect(page.getByRole("status")).toContainText("1 SMS failed");

    await page.getByRole("button", { name: /^drop/i }).click();
    const alert = page.getByRole("checkbox", { name: "Send an SMS alert" });
    await expect(alert).not.toBeChecked();
    await alert.check();
    await page.route("**/api/artist/drop", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ title: "Test gift", notify_sms: true });
      await route.fulfill({ json: {
        ok: true, sent: 1,
        delivery: { inbox: 1, inbox_failed: 0, sms_sent: 1, sms_failed: 0, sms_skipped: 0, status_failed: 0 },
      } });
    });
    await page.getByRole("button", { name: "Saved gift", exact: true }).click();
    await expect(page.getByPlaceholder("Title")).toHaveValue("Saved gift");
    await expect(page.getByPlaceholder("Message")).toHaveValue("A gift for you");
    await page.getByPlaceholder("Title").fill("Test gift");
    await page.getByRole("button", { name: /drop to 1 fan$/i }).click();
    await expect(page.getByRole("status")).toContainText("1 SMS accepted");
  });

  test("shows unavailable SMS and keeps inbox sending enabled", async ({ page }) => {
    await mockConsole(page, false);
    await page.getByRole("button", { name: /^message/i }).click();
    await page.getByRole("button", { name: /^set$/i }).click();
    await expect(page.getByRole("button", { name: "SMS + inbox" })).toBeDisabled();
    await expect(page.getByText(/SMS is unavailable/)).toBeVisible();
    await page.route("**/api/artist/message", async (route) => {
      expect(route.request().postDataJSON().channel).toBe("inbox");
      await route.fulfill({ json: {
        ok: true, sent: 1, live: false,
        delivery: { inbox: 1, inbox_failed: 0, sms_sent: 0, sms_failed: 0, sms_skipped: 0, status_failed: 0 },
      } });
    });
    await page.getByPlaceholder("Message").fill("Inbox UI test");
    await page.getByRole("button", { name: /send to 1 fan$/i }).click();
    await expect(page.getByRole("status")).toHaveText("Sent to 1 fan in the inbox.");
    await page.getByRole("button", { name: /^drop/i }).click();
    await expect(page.getByRole("checkbox", { name: "Send an SMS alert" })).toBeDisabled();
  });

  test("individual fan panel sends SMS and a saved drop with delivery results inside the panel", async ({ page }) => {
    await mockConsole(page, true);
    await page.getByPlaceholder("Search name or @handle").fill("Test Fan");
    await page.getByRole("button", { name: /Test Fan/ }).click();
    const sheet = page.getByTestId("fan-sheet");
    await expect(sheet.getByRole("heading", { name: "Test Fan" })).toBeVisible();
    await sheet.getByRole("button", { name: /^message$/i }).click();
    await page.route("**/api/artist/message", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ user_ids: ["fan"], channel: "sms", body: "Personal message" });
      await route.fulfill({ json: {
        ok: true, sent: 1, live: true,
        delivery: { inbox: 1, inbox_failed: 0, sms_sent: 1, sms_failed: 0, sms_skipped: 0, status_failed: 0 },
      } });
    });
    await sheet.getByPlaceholder("Message Test Fan").fill("Personal message");
    await sheet.getByRole("button", { name: "SMS + inbox" }).click();
    await expect(sheet.getByRole("status")).toContainText("1 SMS accepted");
    await sheet.getByRole("button", { name: /^drop$/i }).click();
    await sheet.getByRole("button", { name: "Saved gift", exact: true }).click();
    await expect(sheet.getByPlaceholder("Title")).toHaveValue("Saved gift");
    const smsAlert = sheet.getByRole("checkbox", { name: "Send an SMS alert" });
    await expect(smsAlert).not.toBeChecked();
    await smsAlert.check();
    await page.route("**/api/artist/drop", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ user_ids: ["fan"], title: "Saved gift", code: "GIFT", notify_sms: true });
      await route.fulfill({ json: {
        ok: true, sent: 1,
        delivery: { inbox: 1, inbox_failed: 0, sms_sent: 0, sms_failed: 1, sms_skipped: 0, status_failed: 0 },
      } });
    });
    await sheet.getByRole("button", { name: "Drop to Test Fan" }).click();
    await expect(sheet.getByRole("heading", { name: "Taps" })).toBeVisible();
    await expect(sheet.getByRole("status")).toContainText("Dropped to 1 fan. 0 SMS accepted · 1 SMS failed");
  });

  test("individual fan panel keeps inbox available when SMS is disabled", async ({ page }) => {
    await mockConsole(page, false);
    await page.getByRole("button", { name: /Test Fan/ }).click();
    const sheet = page.getByTestId("fan-sheet");
    await sheet.getByRole("button", { name: /^message$/i }).click();
    await sheet.getByPlaceholder("Message Test Fan").fill("Personal inbox message");
    await expect(sheet.getByRole("button", { name: "SMS + inbox" })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: "Inbox", exact: true })).toBeEnabled();
    await sheet.getByRole("button", { name: /^drop$/i }).click();
    await expect(sheet.getByRole("checkbox", { name: "Send an SMS alert" })).toBeDisabled();
  });
});
