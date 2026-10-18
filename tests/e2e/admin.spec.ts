import { test, expect } from "@playwright/test";
import { PIN, adminHeaders, deleteEvent, deleteArtist, testUid } from "./helpers";
import type { EventNotification } from "@/lib/event-notifications";

async function unlock(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByPlaceholder("••••").fill(PIN);
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByRole("heading", { name: /^admin$/i })).toBeVisible();
}

test.describe("Event notification controls", () => {
  test.use({ timezoneId: "America/Toronto" });
  const eventA = "00000000-0000-0000-0000-000000000001";
  const eventB = "00000000-0000-0000-0000-000000000002";

  async function setup(page: import("@playwright/test").Page, path: string, sms = true) {
    const notifications: EventNotification[] = [];
    const sent: Record<string, unknown>[] = [];
    const events = [eventA, eventB].map((id, i) => ({
      id, name: `Event ${i === 0 ? "A" : "B"}`, artist: "Test Artist", venue: "Test Venue", date: "2026-10-18",
      activities: [], bands: { total: 3, claimed: 3 },
    }));
    await page.addInitScript(() => localStorage.setItem("cc_staff_pin", "test-pin"));
    await page.route("**/api/admin/events", (route) => route.fulfill({ json: { ok: true, events, artists: [] } }));
    await page.route("**/api/staff/catalog", (route) => route.fulfill({ json: { ok: true, concerts: events, activities: [] } }));
    await page.route("**/api/admin/notifications**", async (route) => {
      expect(route.request().headers()["x-staff-pin"]).toBe("test-pin");
      const url = new URL(route.request().url());
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        sent.push(body);
        notifications.unshift({
          ...body, status: body.scheduled_at ? "scheduled" : "completed",
          created_at: new Date().toISOString(), recipients: 2, inbox_count: body.scheduled_at ? 0 : 2,
          sms_sent: 0, failed: 0, skipped: 0, unknown: 0, remaining: 0,
        });
        return route.fulfill({ status: 201, json: { ok: true, notification: notifications[0] } });
      }
      if (route.request().method() === "DELETE") {
        const notification = notifications.find((n) => n.id === url.searchParams.get("id"))!;
        expect(notification.concert_id).toBe(url.searchParams.get("concert_id"));
        notification.status = "cancelled";
        return route.fulfill({ json: { ok: true } });
      }
      const id = url.searchParams.get("concert_id");
      return route.fulfill({ json: {
        ok: true, event: events.find((event) => event.id === id), notifications: notifications.filter((n) => n.concert_id === id),
        audience: { fans: 2, phones: 1 }, sms_enabled: sms, scheduler_active: true,
      } });
    });
    await page.goto(path);
    await page.getByTestId("event-picker").getByRole("button", { name: /^event a/i }).click();
    await page.getByRole("button", { name: /^alerts$/i }).click();
    await expect(page.getByTestId("event-alerts").getByText("Event A", { exact: true })).toBeVisible();
    return { sent };
  }

  for (const path of ["/admin", "/staff"]) {
    test(`${path}: send now, schedule, cancel, and switch events without leaking the draft`, async ({ page }, testInfo) => {
      const { sent } = await setup(page, path);
      const panel = page.getByTestId("event-alerts");
      await expect(panel.getByText("2 fans · 1 with phone numbers")).toBeVisible();
      await panel.getByRole("button", { name: "SMS", exact: true }).click();
      await panel.getByPlaceholder("Event announcement").fill("Doors open soon");
      await panel.getByRole("button", { name: "Schedule", exact: true }).click();
      const date = await page.evaluate(() => {
        const d = new Date(Date.now() + 86400000);
        d.setSeconds(0, 0);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        return { local, utc: d.toISOString() };
      });
      await panel.getByLabel("Send date and time").fill(date.local);
      await panel.getByRole("button", { name: "Schedule alert", exact: true }).click();
      await expect(panel.getByRole("status")).toContainText("Scheduled for");
      await page.screenshot({ path: testInfo.outputPath("event-alerts.png"), fullPage: true });
      expect(sent[0]).toMatchObject({ concert_id: eventA, body: "Doors open soon", channel: "sms", scheduled_at: date.utc });
      expect(sent[0].id).toMatch(/^[0-9a-f-]{36}$/);
      await panel.getByRole("button", { name: "Cancel alert" }).click();
      await expect(panel.getByText("Cancelled", { exact: true })).toBeVisible();
      await panel.getByPlaceholder("Event announcement").fill("Do not send this to Event B");
      await page.getByRole("button", { name: /all events/i }).click();
      await page.getByTestId("event-picker").getByRole("button", { name: /^event b/i }).click();
      await page.getByRole("button", { name: /^alerts$/i }).click();
      await expect(panel.getByText("Event B", { exact: true })).toBeVisible();
      await expect(panel.getByPlaceholder("Event announcement")).toHaveValue("");
      await expect(panel.getByRole("button", { name: "Inbox", exact: true })).toHaveAttribute("aria-pressed", "true");
      await panel.getByPlaceholder("Event announcement").fill("Event B announcement");
      await panel.getByRole("button", { name: "Send to 2 fans now" }).click();
      await expect(panel.getByText("Completed", { exact: true })).toBeVisible();
      expect(sent[1]).toMatchObject({ concert_id: eventB, body: "Event B announcement", channel: "inbox", scheduled_at: null });
      await expect(panel.getByText("2 inbox copies")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("unavailable SMS and past schedules are handled without sending a request", async ({ page }) => {
    const { sent } = await setup(page, "/admin", false);
    const panel = page.getByTestId("event-alerts");
    await expect(panel.getByRole("button", { name: "SMS", exact: true })).toBeDisabled();
    await panel.getByPlaceholder("Event announcement").fill("Reminder");
    await panel.getByRole("button", { name: "Schedule", exact: true }).click();
    await panel.getByLabel("Send date and time").fill("2020-01-01T12:00");
    await panel.getByRole("button", { name: "Schedule alert", exact: true }).click();
    await expect(panel.getByRole("alert")).toHaveText("Choose a future date and time.");
    expect(sent).toHaveLength(0);
  });
});

test.describe("Admin console", () => {
  test("create event via UI with new team and activities, then it is selected", async ({ page, request }) => {
    const name = `E2E UI Event ${Date.now()}`;
    const team = `E2E UI Team ${Date.now()}`;
    let eventId: string | null = null;
    let artistId: string | null = null;
    try {
      await unlock(page);
      // Form must be closed by default when events exist.
      await expect(page.getByRole("button", { name: /new event/i })).toBeVisible();
      await page.getByRole("button", { name: /new event/i }).click();
      await page.getByPlaceholder("Name").first().fill(name);
      await page.getByPlaceholder("Description").fill("E2E description");
      await page.getByPlaceholder("Venue").fill("E2E Arena");
      await page.getByPlaceholder("Address").fill("1 E2E Way");
      await page.getByPlaceholder("Doors").fill("6:30 PM");
      await page.locator("select").nth(0).selectOption("new");
      await page.getByPlaceholder("Name").nth(1).fill(team);
      await page.locator("select").nth(1).selectOption("team");
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
      await expect(page.getByTestId("event-editor")).toBeVisible();
      await page.getByTestId("event-editor").getByRole("button", { name: /^events$/i }).click();
      await page.getByRole("button", { name: /all events/i }).click();
      await expect(page.getByTestId("event-picker").getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toContainText(team);

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
      await page.getByTestId("event-picker").getByRole("button", { name: new RegExp(ev.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await expect(page.getByText(/2 activities · 0 bands/i)).toBeVisible();
      await page.getByRole("button", { name: /fan zone/i }).click();
      await page.getByRole("button", { name: /open station/i }).click();
      const station = page.getByTestId("station");
      await station.getByRole("button", { name: /go live/i }).click();
      await expect(station.getByRole("button", { name: /live station on/i })).toBeVisible();

      await station.getByPlaceholder("Band UID").fill(uid);
      await station.getByRole("button", { name: /^tap$/i }).click();
      const overlay = page.getByRole("paragraph").filter({ hasText: /^\+75$/ });
      await expect(overlay).toBeVisible();
      await overlay.click();

      await station.getByRole("button", { name: /live station on/i }).click();
      await expect(station.getByRole("button", { name: /go live/i })).toBeVisible();
      await station.getByRole("button", { name: /back to admin/i }).click();
      await expect(page.getByText(/2 activities · 1 band \(/i)).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });

  test("station write mode: manual register; bands tab: lookup, move, archive", async ({ page, request }) => {
    const mk = async (n: string) =>
      (await (await request.post("/api/admin/events", { headers: adminHeaders, data: { name: n, venue: "V", date: "2026-10-20", activities: [{ name: "Entry", points: 50 }] } })).json()).event;
    const a = await mk(`E2E Write A ${Date.now()}`);
    const b = await mk(`E2E Write B ${Date.now()}`);
    const uid = testUid();
    try {
      await unlock(page);
      await page.getByTestId("event-picker").getByRole("button", { name: new RegExp(a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await page.getByRole("button", { name: /open station/i }).click();
      const station = page.getByTestId("station");
      await station.getByRole("button", { name: /^write$/i }).click();
      await expect(station.getByText(/registers each band/i)).toBeVisible();
      await station.getByPlaceholder("Band UID").fill(uid);
      await station.getByRole("button", { name: /^tap$/i }).click();
      await expect(page.getByText(/^registered$/i)).toBeVisible();
      await page.getByText(/^registered$/i).click();
      await station.getByRole("button", { name: /back to admin/i }).click();

      await page.getByRole("button", { name: /^bands$/i }).click();
      await expect(page.getByText(uid).first()).toBeVisible();
      await page.getByPlaceholder("Band UID").fill(uid);
      await page.getByRole("button", { name: /^open$/i }).click();
      await expect(page.getByTestId("band-status")).toHaveText(/unclaimed/i);
      await page.locator("select").last().selectOption(b.id);
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

test.describe("Admin station mode", () => {
  test("full-screen station: scan, read, reset, back", async ({ page, request }) => {
    const r = await request.post("/api/admin/events", {
      headers: adminHeaders,
      data: { name: `E2E Station ${Date.now()}`, venue: "V", date: "2026-10-21", activities: [{ name: "Entry", points: 50 }, { name: "Merch", points: 100 }] },
    });
    const ev = (await r.json()).event;
    const uid = testUid();
    try {
      await unlock(page);
      await page.getByTestId("event-picker").getByRole("button", { name: new RegExp(ev.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await page.getByRole("button", { name: /^merch \+100/i }).click();
      await page.getByRole("button", { name: /open station/i }).click();
      const station = page.getByTestId("station");
      await expect(station).toBeVisible();
      await expect(station.getByText(/^merch$/i)).toBeVisible();

      // scan via manual entry inside the station
      await station.getByPlaceholder("Band UID").fill(uid);
      await station.getByRole("button", { name: /^tap$/i }).click();
      const plus = page.getByRole("paragraph").filter({ hasText: /^\+100$/ });
      await expect(plus).toBeVisible();
      await plus.click();
      await expect(station.getByText(new RegExp(`last: ${uid} · \\+100`, "i"))).toBeVisible();

      // read mode shows points + history
      await station.getByRole("button", { name: /^read$/i }).click();
      await station.getByPlaceholder("Band UID").fill(uid);
      await station.getByRole("button", { name: /^tap$/i }).click();
      await expect(station.getByText(/unclaimed · /i)).toBeVisible();
      await expect(station.getByText("100", { exact: true })).toBeVisible();
      await expect(station.getByText(/^merch$/i).last()).toBeVisible();

      // reset mode wipes it
      await station.getByRole("button", { name: /^reset$/i }).click();
      await expect(station.getByText(/tapped bands lose their scans/i)).toBeVisible();
      await station.getByPlaceholder("Band UID").fill(uid);
      await station.getByRole("button", { name: /^tap$/i }).click();
      await expect(page.getByText(/scans cleared, unclaimed/i)).toBeVisible();
      await page.getByText(/scans cleared, unclaimed/i).click();
      const look = await (await request.get(`/api/admin/bands?uid=${uid}`, { headers: adminHeaders })).json();
      expect(look.band.scans).toHaveLength(0);

      // back returns to admin
      await station.getByRole("button", { name: /back to admin/i }).click();
      await expect(station).toBeHidden();
      await expect(page.getByRole("button", { name: /open station/i })).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });
});

test.describe("Admin content management", () => {
  test("event editor: edit details, add/edit/delete activities, place a pin, set live", async ({ page, request }) => {
    const r = await request.post("/api/admin/events", {
      headers: adminHeaders,
      data: { name: `E2E Edit ${Date.now()}`, venue: "V", date: "2026-10-22", activities: [{ name: "Entry", points: 50 }] },
    });
    const ev = (await r.json()).event;
    try {
      await unlock(page);
      await page.getByTestId("event-picker")
        .getByRole("button", { name: new RegExp(ev.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
        .getByRole("button", { name: /^edit$/i })
        .click();
      const editor = page.getByTestId("event-editor");
      await expect(editor).toBeVisible();

      // details save on blur
      const venue = editor.locator("input").nth(1);
      await venue.fill("Edited Hall");
      await venue.blur();
      await expect.poll(async () => (await (await request.get("/api/admin/events", { headers: adminHeaders })).json()).events.find((e: { id: string }) => e.id === ev.id).venue).toBe("Edited Hall");

      // activities
      await editor.getByRole("button", { name: /^activities$/i }).click();
      await editor.getByRole("button", { name: /\+ add/i }).click();
      const form = page.getByTestId("activity-form");
      await form.getByPlaceholder("Name").fill("Photo Wall");
      await form.getByPlaceholder("pts").fill("75");
      await form.getByRole("button", { name: /^add$/i }).click();
      await expect(editor.getByText(/2 activities · 125 pts/i)).toBeVisible();

      // edit points of Entry
      await editor.getByRole("button", { name: /^entry no location/i }).click();
      await form.getByPlaceholder("pts").fill("60");
      await form.getByRole("button", { name: /^save$/i }).click();
      await expect(editor.getByText(/2 activities · 135 pts/i)).toBeVisible();

      // place Photo Wall on the map by tapping the floor plan
      await editor.getByRole("button", { name: /^place$/i }).last().click();
      const map = editor.getByRole("group", { name: /floor plan/i });
      await map.click({ position: { x: 40, y: 60 } });
      await expect.poll(async () => {
        const list = (await (await request.get("/api/admin/events", { headers: adminHeaders })).json()).events.find((e: { id: string }) => e.id === ev.id);
        return list.activities.find((a: { name: string }) => a.name === "Photo Wall").map_x != null;
      }).toBe(true);

      // live station toggle
      await editor.getByRole("button", { name: /^photo wall$/i }).last().click();
      await expect.poll(async () => (await (await request.get("/api/admin/events", { headers: adminHeaders })).json()).events.find((e: { id: string }) => e.id === ev.id).live_activity_id).not.toBeNull();

      // delete Photo Wall
      page.once("dialog", (d) => d.accept());
      await editor.getByRole("button", { name: /delete photo wall/i }).click();
      await expect(editor.getByText(/1 activities · 60 pts/i)).toBeVisible();
    } finally {
      await deleteEvent(request, ev.id);
    }
  });

  test("rewards: add, edit, delete for an artist; artist profile edits", async ({ page, request }) => {
    const artist = (await (await request.post("/api/admin/artists", { headers: adminHeaders, data: { name: `E2E Rewards Artist ${Date.now()}` } })).json()).artist;
    const ev = (await (await request.post("/api/admin/events", {
      headers: adminHeaders,
      data: { name: `E2E Rewards ${Date.now()}`, venue: "V", date: "2026-10-23", artist_id: artist.id, activities: [{ name: "Entry", points: 50 }] },
    })).json()).event;
    try {
      await unlock(page);
      await page.getByTestId("event-picker").getByRole("button", { name: new RegExp(ev.name) }).click();
      await page.getByRole("button", { name: /^rewards$/i }).click();
      await expect(page.getByText(artist.name, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /0 rewards/i })).toBeVisible();
      await page.getByRole("button", { name: /\+ add/i }).click();
      const ed = page.getByTestId("reward-editor");
      await ed.locator("input").nth(0).fill("E2E Poster");
      await ed.locator("input").nth(1).fill("Signed");
      await ed.locator("input").nth(2).fill("120");
      await ed.getByRole("button", { name: /add reward/i }).click();
      await expect(page.getByRole("heading", { name: /1 rewards/i })).toBeVisible();
      await expect(page.getByText("E2E Poster")).toBeVisible();

      // edit cost
      await page.getByRole("button", { name: /e2e poster/i }).click();
      await ed.locator("input").nth(2).fill("150");
      await ed.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("150", { exact: true })).toBeVisible();

      // delete
      await page.getByRole("button", { name: /e2e poster/i }).click();
      page.once("dialog", (d) => d.accept());
      await ed.getByRole("button", { name: /delete reward/i }).click();
      await expect(page.getByRole("heading", { name: /0 rewards/i })).toBeVisible();

      // artist profile
      await page.getByRole("button", { name: /^profile$/i }).click();
      const ae = page.getByTestId("artist-editor");
      const bio = ae.locator("textarea");
      await bio.fill("E2E bio");
      await bio.blur();
      await expect.poll(async () => (await (await request.get("/api/admin/events", { headers: adminHeaders })).json()).artists.find((a: { id: string }) => a.id === artist.id).bio).toBe("E2E bio");
    } finally {
      await deleteEvent(request, ev.id);
      await deleteArtist(request, artist.id);
    }
  });
});
