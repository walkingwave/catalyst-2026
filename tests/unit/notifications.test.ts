import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyFan, notifyFans } from "@/lib/notifications";
import { sendSms, smsEnabled } from "@/lib/sms";
import { artistRecipients } from "@/lib/artist-recipients";

type Message = { id: string; user_id: string; channel: string; sms_status: string | null; body: string };

// An in-memory messages table exercises insert-before-send, persisted statuses,
// and the first-successful-send lookup without touching real fans or SMS credits.
function messageDb({ failInsert = false, failUpdate = false } = {}) {
  const rows: Message[] = [];
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe("messages");
      return {
        insert: (row: Omit<Message, "id">) => ({
          select: () => ({
            single: async () => {
              if (failInsert) return { data: null, error: { code: "DB_DOWN" } };
              const message = { ...row, id: String(rows.length + 1) };
              rows.push(message);
              return { data: { id: message.id }, error: null };
            },
          }),
        }),
        select: () => {
          const filters: [keyof Message, unknown][] = [];
          const query = {
            eq: (key: keyof Message, value: unknown) => {
              filters.push([key, value]);
              return query;
            },
            then: (resolve: (value: { count: number }) => unknown) =>
              Promise.resolve({ count: rows.filter((row) => filters.every(([key, value]) => row[key] === value)).length }).then(resolve),
          };
          return query;
        },
        update: (patch: Partial<Message>) => ({
          eq: async (_key: string, id: string) => {
            if (failUpdate) return { error: { code: "DB_DOWN" } };
            Object.assign(rows.find((row) => row.id === id)!, patch);
            return { error: null };
          },
        }),
      };
    }),
  } as unknown as SupabaseClient;
  return { db, rows };
}

const notification = {
  artistId: "artist", userId: "fan", phone: "+15550100001",
  body: "Meet us at the merch booth.", smsBody: "Artist: Meet us at the merch booth.", sms: true,
};

describe("fan notifications", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("SMS_NOTIFICATIONS", "true");
    vi.stubEnv("TEXTBELT_KEY", "test-paid-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: async () => ({ success: true, quotaRemaining: 10 }) });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves the inbox before sending, waits for provider acceptance, and adds the notice only before the first success", async () => {
    const { db, rows } = messageDb();
    let accept!: (response: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { accept = resolve; }));
    const pending = notifyFan(db, notification);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(rows[0]).toMatchObject({ body: notification.body, sms_status: "pending" });
    accept({ json: async () => ({ success: true }) });
    expect(await pending).toMatchObject({ inbox: true, sms: "sent", statusSaved: true });
    expect(rows[0].sms_status).toBe("sent");
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(first).toMatchObject({ phone: notification.phone, key: "test-paid-key", sender: "BandDrop" });
    // No link by default: Textbelt rejects URLs until the key is whitelisted.
    expect(first.message).toBe(`${notification.smsBody}\n\nReply STOP to unsubscribe.`);

    vi.stubEnv("SMS_LINKS", "true");
    await notifyFan(db, notification);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).message).toBe(`${notification.smsBody}\nhttps://banddrop.vercel.app/dashboard`);
  });

  it("never stores or returns the provider key from a Textbelt error", async () => {
    const { db, rows } = messageDb();
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, error: "Sorry, ability to send URLs via text is limited to verified accounts. Please go to https://textbelt.com/whitelist?key=test-paid-key or email support" }) });
    await notifyFan(db, notification);
    expect(rows[0].sms_status).not.toContain("test-paid-key");
    expect(rows[0].sms_status).toMatch(/blocks links/);
    const r = await sendSms("+15550100001", "x");
    expect(JSON.stringify(r)).not.toContain("test-paid-key");
  });

  it("keeps the inbox on provider rejection and includes the notice on the next attempt", async () => {
    const { db, rows } = messageDb();
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, error: "Out of quota" }) });
    expect(await notifyFan(db, notification)).toMatchObject({ inbox: true, sms: "failed" });
    expect(rows[0].sms_status).toBe("failed: Out of quota");
    await notifyFan(db, notification);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).message).toContain("Reply STOP");
  });

  it("persists disabled and missing-phone outcomes without sending", async () => {
    const { db, rows } = messageDb();
    vi.stubEnv("SMS_NOTIFICATIONS", "false");
    expect(await notifyFan(db, notification)).toMatchObject({ inbox: true, sms: "skipped" });
    expect(rows[0].sms_status).toBe("disabled");
    vi.stubEnv("SMS_NOTIFICATIONS", "true");
    await notifyFan(db, { ...notification, phone: null });
    expect(rows[1].sms_status).toBe("no_phone");
    await notifyFan(db, { ...notification, sms: false });
    expect(rows[2]).toMatchObject({ channel: "inbox", sms_status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends if the inbox insert fails", async () => {
    const { db } = messageDb({ failInsert: true });
    expect(await notifyFan(db, notification)).toMatchObject({ inbox: false, sms: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports partial success and status-write failures without claiming every SMS was sent", async () => {
    const { db } = messageDb({ failUpdate: true });
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, error: "Rejected" }) });
    const result = await notifyFans(db, [notification, { ...notification, phone: null }]);
    expect(result).toEqual({ inbox: 2, inbox_failed: 0, sms_sent: 0, sms_failed: 1, sms_skipped: 1, status_failed: 1 });
  });

  it("records ambiguous timeouts without retrying the SMS", async () => {
    const { db, rows } = messageDb();
    fetchMock.mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    await notifyFan(db, notification);
    expect(rows[0].sms_status).toContain("delivery unknown");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requires complete Twilio configuration when Textbelt is absent", () => {
    vi.stubEnv("TEXTBELT_KEY", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "sid");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_FROM", "");
    expect(smsEnabled()).toBe(false);
  });

  it("keeps OTP delivery independent of the notification toggle", async () => {
    vi.stubEnv("SMS_NOTIFICATIONS", "false");
    await sendSms(notification.phone, "123456 is your BandDrop code.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await sendSms(notification.phone, "123456 is your BandDrop code.", { force: true })).toMatchObject({ ok: true, provider: "textbelt" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("artist notification audience", () => {
  const fan = "00000000-0000-0000-0000-000000000001";
  const attendee = "00000000-0000-0000-0000-000000000002";
  const outsider = "00000000-0000-0000-0000-000000000003";

  function audienceDb() {
    const usersQuery = vi.fn(async (_column: string, ids: string[]) => ({
      data: ids.map((id) => ({ id, phone: null })), error: null,
    }));
    const db = { from: vi.fn((table: string) => {
      if (table === "leaderboard_artist") return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ user_id: fan }], error: null }) }) }) };
      if (table === "concerts") return { select: () => ({ eq: async () => ({ data: [{ id: "concert" }], error: null }) }) };
      if (table === "bands") return { select: () => ({ in: () => ({ not: async () => ({ data: [{ user_id: attendee }], error: null }) }) }) };
      if (table === "users") return { select: () => ({ in: usersQuery }) };
      throw new Error(`Unexpected table ${table}`);
    }) } as unknown as SupabaseClient;
    return { db, usersQuery };
  }

  it("allows zero-point attendees and deduplicates selected fans", async () => {
    const { db } = audienceDb();
    expect(await artistRecipients(db, "artist", { user_ids: [attendee, attendee] })).toEqual([{ id: attendee, phone: null }]);
  });

  it("rejects recipients outside the artist audience before loading their phone numbers", async () => {
    const { db, usersQuery } = audienceDb();
    await expect(artistRecipients(db, "artist", { user_ids: [outsider] })).rejects.toThrow("this artist's audience");
    expect(usersQuery).not.toHaveBeenCalled();
  });

  it("limits Top N to the ranked audience and rejects invalid batch sizes", async () => {
    const { db } = audienceDb();
    expect(await artistRecipients(db, "artist", { top: 1 })).toEqual([{ id: fan, phone: null }]);
    await expect(artistRecipients(db, "artist", { top: 101 })).rejects.toThrow("between 1 and 100");
    await expect(artistRecipients(db, "artist", { user_ids: Array(101).fill(fan) })).rejects.toThrow("up to 100 fans");
  });
});
