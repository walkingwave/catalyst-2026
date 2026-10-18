import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEventNotification, runEventNotifications } from "@/lib/event-notifications";
import { POST as cron } from "@/app/api/cron/notifications/route";
import { GET, POST, DELETE } from "@/app/api/admin/notifications/route";
import { sendSms, smsEnabled, smsWithOptOut } from "@/lib/sms";
import * as admin from "@/lib/supabase/admin";
import { after } from "next/server";

vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(), smsEnabled: vi.fn(), smsWithOptOut: vi.fn(async (_db, _id, body) => body),
}));
const input = {
  id: "00000000-0000-0000-0000-000000000001",
  concert_id: "00000000-0000-0000-0000-000000000002",
  body: "Doors open soon.", channel: "sms", scheduled_at: null,
};

describe("event notification validation", () => {
  it("keeps immediate sends distinct from scheduled sends and trims messages", () => {
    expect(parseEventNotification({ ...input, body: "  Hello  " })).toMatchObject({ body: "Hello", scheduled_at: null });
  });
  it("normalizes an explicit timezone to UTC", () => {
    expect(parseEventNotification({ ...input, scheduled_at: "2026-10-18T19:30:00-04:00" }, Date.parse("2026-10-18T12:00Z")).scheduled_at).toBe("2026-10-18T23:30:00.000Z");
  });
  it.each(["2020-01-01T00:00:00Z", "not-a-date", "2030-01-01T00:00:00Z", "2026-10-18T19:30"])("rejects invalid schedule %s", (scheduled_at) => {
    expect(() => parseEventNotification({ ...input, scheduled_at }, Date.parse("2026-10-18T12:00Z"))).toThrow();
  });
  it.each([null, {}, { ...input, channel: "email" }, { ...input, concert_id: "bad" }, { ...input, body: " " }, { ...input, body: "x".repeat(321) }])("rejects malformed requests", (value) => {
    expect(() => parseEventNotification(value)).toThrow();
  });
});

describe("worker delivery", () => {
  beforeEach(() => {
    vi.mocked(smsEnabled).mockReturnValue(true);
    vi.mocked(sendSms).mockResolvedValue({ ok: true, provider: "textbelt" });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  function database(rows: object[]) {
    let claimed = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_event_notification_batch") {
        const data = claimed ? [] : rows;
        claimed = true;
        return { data, error: null };
      }
      return { data: true, error: null };
    });
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { rpc, from: () => ({ upsert }) } as unknown as SupabaseClient;
    return { db, rpc, upsert };
  }
  const row = { delivery_id: "delivery", user_id: "fan", phone: "+15550100001", body: "Hello", channel: "sms", event_name: "Event A" };

  it("sends only database-reserved recipients and records provider acceptance", async () => {
    const { db, rpc, upsert } = database([row]);
    expect(await runEventNotifications(db)).toEqual({ processed: 1 });
    expect(upsert).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledExactlyOnceWith(row.phone, "Event A: Hello");
    expect(smsWithOptOut).toHaveBeenCalledWith(db, "fan", "Event A: Hello");
    expect(rpc).toHaveBeenCalledWith("finish_event_notification_delivery", { p_delivery_id: "delivery", p_status: "sent", p_error: null });
  });

  it("does not send an SMS for inbox-only recipients or invent a scheduler heartbeat on immediate sends", async () => {
    const { db, upsert } = database([{ ...row, channel: "inbox" }]);
    await runEventNotifications(db, input.id);
    expect(sendSms).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("records missing phones and disabled providers as skipped, preserving the queued inbox copy", async () => {
    const { db, rpc } = database([{ ...row, phone: null }, { ...row, delivery_id: "second" }]);
    vi.mocked(smsEnabled).mockReturnValue(false);
    await runEventNotifications(db);
    expect(sendSms).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("finish_event_notification_delivery", expect.objectContaining({ p_status: "skipped", p_error: "No phone number" }));
    expect(rpc).toHaveBeenCalledWith("finish_event_notification_delivery", expect.objectContaining({ p_status: "skipped", p_error: "SMS is disabled" }));
  });

  it("records ambiguous timeouts as unknown without retrying", async () => {
    const { db, rpc } = database([row]);
    vi.mocked(sendSms).mockResolvedValue({ ok: false, provider: "textbelt", error: "SMS request timed out; delivery unknown" });
    await runEventNotifications(db);
    expect(sendSms).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("finish_event_notification_delivery", expect.objectContaining({ p_status: "unknown" }));
  });
});

describe("notification authorization", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("rejects all staff queue operations without the staff PIN", async () => {
    vi.stubEnv("STAFF_PIN", "test-pin");
    for (const handler of [GET, POST, DELETE]) {
      expect((await handler(new Request("http://localhost/api/admin/notifications"))).status).toBe(401);
    }
  });
  it("fails closed if the cron secret is unset or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron(new Request("http://localhost/api/cron/notifications"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "expected");
    expect((await cron(new Request("http://localhost/api/cron/notifications", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
});

describe("notification request idempotency", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
  function database() {
    type Stored = ReturnType<typeof parseEventNotification> & { status: string };
    const rows = new Map<string, Stored>();
    const inserts = vi.fn((row: ReturnType<typeof parseEventNotification>) => ({
      select: () => ({ maybeSingle: async () => {
        if (rows.has(row.id)) return { data: null, error: null };
        const stored = { ...row, status: "scheduled" };
        rows.set(row.id, stored);
        return { data: stored, error: null };
      } }),
    }));
    const db = { from: (table: string) => ({
      select: () => ({ eq: (_key: string, id: string) => ({
        maybeSingle: async () => ({ data: table === "concerts" ? { id } : rows.get(id) ?? null, error: null }),
      }) }),
      upsert: inserts,
    }) } as unknown as ReturnType<typeof admin.createAdminClient>;
    vi.spyOn(admin, "createAdminClient").mockReturnValue(db);
    vi.stubEnv("STAFF_PIN", "test-pin");
    vi.mocked(smsEnabled).mockReturnValue(true);
    return { rows, inserts };
  }
  const request = (body: unknown) => new Request("http://localhost/api/admin/notifications", {
    method: "POST", headers: { "x-staff-pin": "test-pin", "content-type": "application/json" }, body: JSON.stringify(body),
  });

  it("creates only one broadcast for a repeated request ID, and rejects reusing it for another event", async () => {
    const { rows, inserts } = database();
    expect((await POST(request(input))).status).toBe(201);
    expect((await POST(request(input))).status).toBe(200);
    expect(rows.size).toBe(1);
    expect(inserts).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    expect((await POST(request({ ...input, concert_id: "00000000-0000-0000-0000-000000000003" }))).status).toBe(409);
  });

  it("accepts retries of past schedules only when that exact notification was already saved", async () => {
    const { rows, inserts } = database();
    const body = { ...input, scheduled_at: "2020-01-01T00:00:00.000Z" };
    expect((await POST(request(body))).status).toBe(400);
    rows.set(input.id, { ...input, channel: "sms", scheduled_at: body.scheduled_at, status: "completed" });
    expect((await POST(request(body))).status).toBe(200);
    expect(inserts).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
});
