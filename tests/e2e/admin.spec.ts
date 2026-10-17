import { test, expect } from "@playwright/test";
import { PIN, adminHeaders, deleteEvent, deleteArtist, testUid } from "./helpers";

async function unlock(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByPlaceholder("••••").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByRole("heading", { name: /^admin$/i })).toBeVisible();
}

test.describe("Admin console", () => {
  test("create event via UI with new team and activities, then it is selected", async ({ page, request }) => {
    const name = `E2E UI Event ${Date.now()}`;
    const team = `E2E UI Team ${Date.now()}`;
    let eventId: string | null = null;
    let artistId: string | null = null;
    try {
      await unlock(page);
      await page.getByRole("button", { name: /^events$/i }).click();
      // Form must be closed by default when events exist.
      await expect(page.getByRole("button", { name: /new event/i })).toBeVisible();
      await page.getByRole("button", { name: /new event/i }).click();
      await page.getByPlaceholder("Name").first().fill(name);
      await page.getByPlaceholder("Description").fill("E2E description");
      await page.getByPlaceholder("Venue").fill("E2E Arena");
      await page.getByPlaceholder("Address").fill("1 E2E Way");
      await page.getByPlaceholder("Doors").fill("6:30 PM");
      await page.locator("select").nth(1).selectOption("new");
      await page.getByPlaceholder("Name").nth(1).fill(team);
      await page.locator("select").nth(2).selectOption("team");
      // edit points of first activity, add one, remove one
      const pts = page.getByPlaceholder("pts");
      await pts.first().fill("60");
      await page.getByRole("button", { name: /add activity/i }).click();
      await page.getByPlaceholder("Activity").last().fill("Trivia");
      await pts.last().fill("120");
      await page.getByRole("button", { name: /remove/i }).nth(2).click(); // remove Photo Wall
      await expect(page.getByText(/280 pts possible/i)).toBeVisible();
      await page.getByRole("button", { name: /create event/i }).click();

      await expect(page.getByText(/event created/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /^write bands$/i })).toBeVisible();
      await expect(page.getByRole("combobox").first()).toContainText(team);

      const list = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
      const ev = list.events.find((e: { name: string }) => e.name === name);
      expect(ev).toBeTruthy();
      eventId = ev.id;
      artistId = ev.artist_id;
      expect(ev.activities.map((a: { name: string; points: number }) => `${a.name}:${a.points}`).sort()).toEqual(["Entry:60", "Merch Booth:100", "Trivia:120"]);
    } finally {
      if (eventId) await deleteEvent(request, eventId);
      if (artistId) await deleteArtist(request, artistId);
    }
  });

  test("tap tab: switch event, go live, manual tap, turn off", async ({ page, request }) => {
    const r = await request.post("/api/admin/events", {
      headers: adminHeaders,
      data: { name: `E2E Admin Tap ${Date.now()}`, venue: "V", date: "2026-10-20", activities: [{ name: "Entry", points: 50 }, { name: "Fan Zone", points: 75 }] },
    });
    const ev = (await r.json()).event;
    const uid = testUid();
    try {
      await unlock(page);
      await page.getByRole("combobox").first().selectOption(ev.id);
      await expect(page.getByText(/2 activities · 0 bands/i)).toBeVisible();
      await page.getByRole("button", { name: /fan zone/i }).click();
      await page.getByRole("button", { name: /go live: fan zone/i }).click();
      await expect(page.getByText(/any phone tapping a band/i)).toBeVisible();

      await page.getByPlaceholder("Band UID").fill(uid);
      await page.locator("form").getByRole("button", { name: /^tap$/i }).click();
      const overlay = page.getByRole("paragraph").filter({ hasText: /^\+75$/ });
      await expect(overlay).toBeVisible();
      await overlay.click();
      await expect(page.getByText(/2 activities · 1 band \(/i)).toBeVisible();

      await page.getByRole("button", { name: /turn off/i }).click();
      await expect(page.getByText(/^off$/i)).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });

  test("write tab: manual register shows tag url; bands tab: lookup, move, archive", async ({ page, request }) => {
    const mk = async (n: string) =>
      (await (await request.post("/api/admin/events", { headers: adminHeaders, data: { name: n, venue: "V", date: "2026-10-20", activities: [{ name: "Entry", points: 50 }] } })).json()).event;
    const a = await mk(`E2E Write A ${Date.now()}`);
    const b = await mk(`E2E Write B ${Date.now()}`);
    const uid = testUid();
    try {
      await unlock(page);
      await page.getByRole("combobox").first().selectOption(a.id);
      await page.getByRole("button", { name: /^write$/i }).click();
      await expect(page.getByText(/no nfc in this browser/i)).toBeVisible();
      await test.step("register", async () => {
        await page.getByPlaceholder("Band UID").first().fill(uid);
        await page.getByRole("button", { name: /^register$/i }).click();
        await expect(page.getByRole("paragraph").filter({ hasText: /^written$/i })).toBeVisible();
        await page.getByRole("paragraph").filter({ hasText: /^written$/i }).click({ timeout: 5_000 });
        await expect(page.getByText(new RegExp(`created · .*\\/b\\/${uid}`))).toBeVisible();
      });
      await test.step("bands tab", async () => {
        await page.getByRole("button", { name: /^bands$/i }).click();
        await expect(page.getByText(uid).first()).toBeVisible();
        await page.getByPlaceholder("Band UID").fill(uid);
        await page.getByRole("button", { name: /^open$/i }).click();
      });
      await expect(page.getByTestId("band-status")).toHaveText(/unclaimed/i);
      await page.locator("select").last().selectOption(b.id);
      // Regression: this row used to overflow the phone viewport and push Move off-screen.
      const mv = page.getByRole("button", { name: /^move$/i });
      const box = (await mv.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await mv.click();
      await expect(page.getByText(/band assigned/i)).toBeVisible();
      await page.getByRole("button", { name: /^archive$/i }).click();
      await expect(page.getByTestId("band-status")).toHaveText(/archived/i);
      await page.getByRole("button", { name: /^restore$/i }).click();
      await expect(page.getByTestId("band-status")).toHaveText(/unclaimed/i);
    } finally {
      await deleteEvent(request, a.id);
      await deleteEvent(request, b.id);
    }
  });
});
