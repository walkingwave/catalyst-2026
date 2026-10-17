import { test, expect } from "@playwright/test";
import { adminHeaders, createEvent, deleteEvent, registerBand, scan, testUid, createArtist, deleteArtist, OLP_CODE, goLive } from "./helpers";

test.describe("API integration", () => {
  test("staff verify: right and wrong PIN", async ({ request }) => {
    expect((await request.post("/api/staff/verify", { data: { pin: "0000" } })).status()).toBe(401);
    expect((await request.post("/api/staff/verify", { data: { pin: adminHeaders["x-staff-pin"] } })).ok()).toBeTruthy();
  });

  test("staff catalog needs PIN and returns concerts + activities", async ({ request }) => {
    expect((await request.get("/api/staff/catalog")).status()).toBe(401);
    const r = await request.get("/api/staff/catalog", { headers: adminHeaders });
    const j = await r.json();
    expect(j.concerts.length).toBeGreaterThan(0);
    expect(j.activities.length).toBeGreaterThan(0);
  });

  test("scan: auto-register, award, duplicate, bad activity, bad PIN, cross-event", async ({ request }) => {
    const ev = await createEvent(request, { name: `E2E Scan ${Date.now()}`, new_artist: { name: `E2E Artist ${Date.now()}` } });
    const other = await createEvent(request, { name: `E2E Other ${Date.now()}`, artist_id: ev.artist_id! });
    const uid = testUid();
    try {
      const entry = ev.activities.find((a) => a.name === "Entry")!;
      const first = await scan(request, uid, entry.id);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ ok: true, status: "scanned", points: 50, claimed: false });

      const dup = await scan(request, uid, entry.id);
      expect(dup.body).toMatchObject({ ok: false, status: "duplicate", points: 0 });

      const cross = await scan(request, uid, other.activities[0].id);
      expect(cross.status).toBe(409);
      expect(cross.body.message).toMatch(/different concert/i);

      expect((await request.post("/api/scan", { headers: adminHeaders, data: { band_uid: uid, activity_id: "00000000-0000-0000-0000-000000000000" } })).status()).toBe(404);
      expect((await request.post("/api/scan", { headers: { "x-staff-pin": "nope" }, data: {} })).status()).toBe(401);
      expect((await request.post("/api/scan", { headers: adminHeaders, data: { band_uid: "x", activity_id: entry.id } })).status()).toBe(400);
    } finally {
      await deleteEvent(request, other.id);
      await deleteEvent(request, ev.id);
      if (ev.artist_id) await deleteArtist(request, ev.artist_id);
    }
  });

  test("claim requires a session", async ({ request }) => {
    const r = await request.post("/api/claim", { data: { uid: "04A1B2C3D4E509" } });
    expect(r.status()).toBe(401);
  });

  test("social + profile require a session", async ({ request }) => {
    expect((await request.post("/api/social", { data: { activity_id: "x", url: "https://x" } })).status()).toBe(401);
    expect((await request.post("/api/profile", { data: { name: "x" } })).status()).toBe(401);
  });

  test("admin events: list, create validation, create, live station, delete", async ({ request }) => {
    expect((await request.get("/api/admin/events")).status()).toBe(401);
    const list = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
    expect(list.events.length).toBeGreaterThan(0);
    expect(list.events[0]).toHaveProperty("activities");
    expect(list.events[0]).toHaveProperty("bands");

    const bad = await request.post("/api/admin/events", { headers: adminHeaders, data: { name: "x" } });
    expect(bad.status()).toBe(400);
    const noActs = await request.post("/api/admin/events", { headers: adminHeaders, data: { name: "x", venue: "y", date: "2026-01-01", activities: [] } });
    expect(noActs.status()).toBe(400);

    const ev = await createEvent(request, { name: `E2E Admin ${Date.now()}`, new_artist: { name: `E2E Team ${Date.now()}`, kind: "team" } });
    try {
      expect(ev.activities).toHaveLength(3);
      await goLive(request, ev.id, ev.activities[0].id);
      const after = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
      expect(after.events.find((e: { id: string }) => e.id === ev.id).live_activity_id).toBe(ev.activities[0].id);
      // wrong activity for this event
      const wrong = await request.patch("/api/admin/events", { headers: adminHeaders, data: { id: ev.id, live_activity_id: after.events.find((e: { id: string }) => e.id !== ev.id).activities[0].id } });
      expect(wrong.status()).toBe(400);
      await goLive(request, ev.id, null);
    } finally {
      await deleteEvent(request, ev.id);
      if (ev.artist_id) await deleteArtist(request, ev.artist_id);
    }
    const gone = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
    expect(gone.events.some((e: { id: string }) => e.id === ev.id)).toBe(false);
  });

  test("admin bands: register, idempotent, move, lookup, archive/restore, unclaim, clear", async ({ request }) => {
    const ev = await createEvent(request, { name: `E2E Bands ${Date.now()}` });
    const ev2 = await createEvent(request, { name: `E2E Bands2 ${Date.now()}` });
    const uid = testUid();
    try {
      expect((await registerBand(request, `04:${uid.slice(2).match(/.{2}/g)!.join(":")}`, ev.id)).status).toBe("created");
      expect((await registerBand(request, uid, ev.id)).status).toBe("already");
      await scan(request, uid, ev.activities[0].id);
      expect((await registerBand(request, uid, ev2.id)).status).toBe("moved");

      const look = await (await request.get(`/api/admin/bands?uid=${uid}`, { headers: adminHeaders })).json();
      expect(look.band.concert_id).toBe(ev2.id);
      expect(look.band.scans).toHaveLength(1);
      expect(look.tag_url).toContain(`/b/${uid}`);

      const list = await (await request.get(`/api/admin/bands?concert=${ev2.id}`, { headers: adminHeaders })).json();
      expect(list.bands.map((b: { uid: string }) => b.uid)).toContain(uid);

      for (const action of ["archive", "restore", "unclaim", "clear_scans"]) {
        expect((await request.patch("/api/admin/bands", { headers: adminHeaders, data: { uid, action } })).ok()).toBeTruthy();
      }
      const cleared = await (await request.get(`/api/admin/bands?uid=${uid}`, { headers: adminHeaders })).json();
      expect(cleared.band.scans).toHaveLength(0);
      expect((await request.patch("/api/admin/bands", { headers: adminHeaders, data: { uid, action: "nope" } })).status()).toBe(400);
      const unknown = await (await request.get(`/api/admin/bands?uid=04E2EUNKNOWN1`, { headers: adminHeaders })).json();
      expect(unknown.band).toBeNull();
    } finally {
      await deleteEvent(request, ev.id);
      await deleteEvent(request, ev2.id);
    }
  });

  test("admin rewards + artists create/delete", async ({ request }) => {
    const artist = await createArtist(request, `E2E Rewards ${Date.now()}`);
    try {
      const r = await request.post("/api/admin/rewards", { headers: adminHeaders, data: { artist_id: artist.id, name: "Code thing", cost: 10, type: "discount_code", codes: ["A-1", "A-2"] } });
      const j = await r.json();
      expect(j.reward.stock).toBe(2);
      expect((await request.post("/api/admin/rewards", { headers: adminHeaders, data: { name: "x" } })).status()).toBe(400);
    } finally {
      await deleteArtist(request, artist.id);
    }
  });

  test("artist console: verify, overview, message, drop, social review guard", async ({ request }) => {
    expect((await request.post("/api/artist/verify", { headers: { "x-artist-code": "nope" } })).status()).toBe(401);
    const v = await (await request.post("/api/artist/verify", { headers: { "x-artist-code": OLP_CODE } })).json();
    expect(v.artist.name).toBe("Our Lady Peace");

    const o = await (await request.get("/api/artist/overview", { headers: { "x-artist-code": OLP_CODE } })).json();
    expect(o.top_fans.length).toBeGreaterThan(0);
    expect(o.top_fans[0]).toHaveProperty("rank", 1);
    expect(o.top_fans[0]).not.toHaveProperty("phone"); // only a hint is exposed
    expect(o.stats).toMatchObject({ fans: expect.any(Number), shows: expect.any(Number), pending_posts: expect.any(Number) });

    const empty = await request.post("/api/artist/message", { headers: { "x-artist-code": OLP_CODE, "content-type": "application/json" }, data: { body: "  ", top: 1 } });
    expect(empty.status()).toBe(400);
    const none = await request.post("/api/artist/message", { headers: { "x-artist-code": OLP_CODE, "content-type": "application/json" }, data: { body: "hi", user_ids: [] } });
    expect(none.status()).toBe(400);

    const m = await (await request.post("/api/artist/message", { headers: { "x-artist-code": OLP_CODE, "content-type": "application/json" }, data: { body: `E2E inbox ${Date.now()}`, channel: "inbox", top: 1 } })).json();
    expect(m).toMatchObject({ ok: true, sent: 1 });
    const d = await (await request.post("/api/artist/drop", { headers: { "x-artist-code": OLP_CODE, "content-type": "application/json" }, data: { title: `E2E drop ${Date.now()}`, code: "E2E", top: 1 } })).json();
    expect(d).toMatchObject({ ok: true, sent: 1 });

    const guard = await request.post("/api/artist/social", { headers: { "x-artist-code": OLP_CODE, "content-type": "application/json" }, data: { id: "00000000-0000-0000-0000-000000000000", status: "approved" } });
    expect(guard.status()).toBe(404);
  });

  test("cron archive is protected when CRON_SECRET set, else runs", async ({ request }) => {
    const r = await request.get("/api/cron/archive");
    expect([200, 401]).toContain(r.status());
  });
});
