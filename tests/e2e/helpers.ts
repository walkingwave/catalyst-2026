import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PIN = process.env.STAFF_PIN ?? "1234";
export const OTP = "123456";
export const FAN_PHONE = "5550100099"; // Demo Fan, Supabase test OTP number
export const FAN_NAME = "Demo Fan";
export const FAN_STATE = "tests/e2e/.auth/fan.json"; // saved by auth.setup.ts
/* Supabase allows one OTP per number per 60s. Each UI login below uses its own test number. */
export const PHONES = { maya: "5550100001", jordan: "5550100002", priya: "5550100003", leo: "5550100004", sam: "5550100005", ava: "5550100006" };
export const OLP_CODE = "OLP2026";
export const adminHeaders = { "x-staff-pin": PIN, "content-type": "application/json" };

export const uniq = () => Date.now().toString(16).toUpperCase().slice(-8);
export const testUid = () => `04E2E0${uniq()}`; // 14 chars like a 7-byte NTAG serial, unique per call

/** UI sign-in with a test OTP number. Lands on `next` (default /dashboard). */
export async function loginAs(page: Page, phone = FAN_PHONE, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByPlaceholder("Phone number").fill(phone);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByPlaceholder("Code").fill(OTP);
  await page.getByRole("button", { name: /confirm/i }).click();
  await page.waitForURL((u) => u.pathname === next.split("?")[0], { timeout: 20_000 });
}

/* ---------- admin API helpers (service role via staff PIN) ---------- */

export type TestEvent = {
  id: string;
  name: string;
  artist: string;
  artist_id: string | null;
  activities: { id: string; name: string; points: number; kind?: string }[];
};

export async function createArtist(request: APIRequestContext, name: string, kind: "artist" | "team" = "artist") {
  const r = await request.post("/api/admin/artists", { headers: adminHeaders, data: { name, kind, access_code: `E2E${uniq()}` } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const j = await r.json();
  return j.artist as { id: string; slug: string; name: string; kind: string; access_code: string };
}

export async function createEvent(
  request: APIRequestContext,
  opts: { name: string; artist_id?: string; new_artist?: { name: string; kind?: "artist" | "team" }; activities?: TestEvent["activities"] | { name: string; points: number; kind?: string; social_network?: string }[] },
) {
  const r = await request.post("/api/admin/events", {
    headers: adminHeaders,
    data: {
      name: opts.name,
      description: "E2E test event",
      venue: "Test Hall",
      address: "1 Test St",
      date: new Date().toISOString().slice(0, 10),
      doors_at: "7:00 PM",
      artist_id: opts.artist_id,
      new_artist: opts.new_artist,
      activities: opts.activities ?? [
        { name: "Entry", points: 50 },
        { name: "Merch Booth", points: 100 },
        { name: "Photo Wall", points: 75 },
      ],
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).event as TestEvent;
}

export async function deleteEvent(request: APIRequestContext, id: string) {
  await request.delete(`/api/admin/events?id=${id}`, { headers: adminHeaders });
}
export async function deleteArtist(request: APIRequestContext, id: string) {
  await request.delete(`/api/admin/artists?id=${id}`, { headers: adminHeaders });
}

export async function registerBand(request: APIRequestContext, uid: string, concert_id: string) {
  const r = await request.post("/api/admin/bands", { headers: adminHeaders, data: { uid, concert_id } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { uid: string; status: string; tag_url: string };
}

export async function scan(request: APIRequestContext, band_uid: string, activity_id: string) {
  const r = await request.post("/api/scan", { headers: adminHeaders, data: { band_uid, activity_id } });
  return { status: r.status(), body: await r.json() };
}

export async function goLive(request: APIRequestContext, id: string, live_activity_id: string | null) {
  const r = await request.patch("/api/admin/events", { headers: adminHeaders, data: { id, live_activity_id } });
  expect(r.ok(), await r.text()).toBeTruthy();
}

export async function createReward(
  request: APIRequestContext,
  data: { artist_id: string; name: string; cost: number; type?: "merch" | "discount_code"; stock?: number; codes?: string[] },
) {
  const r = await request.post("/api/admin/rewards", { headers: adminHeaders, data });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()).reward as { id: string; name: string; cost: number; stock: number };
}
