import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, smsEnabled, smsWithOptOut } from "@/lib/sms";

export type EventNotification = {
  id: string;
  concert_id: string;
  body: string;
  channel: "inbox" | "sms";
  scheduled_at: string | null;
  status: "scheduled" | "processing" | "completed" | "cancelled";
  created_at: string;
  recipients: number;
  inbox_count: number;
  sms_sent: number;
  failed: number;
  skipped: number;
  unknown: number;
  remaining: number;
};

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseEventNotification(input: unknown, now = Date.now(), allowPast = false) {
  if (!input || typeof input !== "object") throw new Error("Invalid notification.");
  const b = input as Record<string, unknown>;
  if (!isUuid(b.id) || !isUuid(b.concert_id)) throw new Error("Select an event.");
  if (typeof b.body !== "string" || !b.body.trim() || b.body.trim().length > 320) throw new Error("Enter a message of 1–320 characters.");
  if (b.channel !== "sms" && b.channel !== "inbox") throw new Error("Choose SMS or Inbox.");
  let scheduled_at: string | null = null;
  if (b.scheduled_at !== null && b.scheduled_at !== undefined) {
    if (typeof b.scheduled_at !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(b.scheduled_at)) throw new Error("Choose a valid date and time.");
    const timestamp = Date.parse(b.scheduled_at);
    if (!Number.isFinite(timestamp) || (!allowPast && timestamp <= now) || timestamp > now + 365 * 86400000) throw new Error("Choose a future time within the next year.");
    scheduled_at = new Date(timestamp).toISOString();
  }
  return { id: b.id, concert_id: b.concert_id, body: b.body.trim(), channel: b.channel, scheduled_at };
}

type Delivery = { delivery_id: string; user_id: string; phone: string | null; body: string; channel: "inbox" | "sms"; event_name: string };

async function deliver(db: SupabaseClient, delivery: Delivery) {
  let status = "sent";
  let error: string | null = null;
  if (delivery.channel === "sms") {
    if (!smsEnabled() || !delivery.phone) {
      status = "skipped";
      error = !delivery.phone ? "No phone number" : "SMS is disabled";
    } else {
      try {
        const body = await smsWithOptOut(db, delivery.user_id, `${delivery.event_name}: ${delivery.body}`);
        const result = await sendSms(delivery.phone, body);
        status = result.ok ? "sent" : result.error?.includes("delivery unknown") ? "unknown" : "failed";
        error = result.ok ? null : result.error ?? "SMS failed";
      } catch {
        status = "unknown";
        error = "Send interrupted; check delivery before resending.";
      }
    }
  }
  const { error: saveError, data } = await db.rpc("finish_event_notification_delivery", {
    p_delivery_id: delivery.delivery_id, p_status: status, p_error: error,
  });
  if (saveError || !data) throw new Error("Could not save notification delivery status.");
}

/** Database reservations prevent concurrent cron / immediate calls from duplicating a send. */
export async function runEventNotifications(db: SupabaseClient, notificationId?: string) {
  // Only a recurring worker updates this, not a one-off "Send now" request.
  if (!notificationId) {
    const { error } = await db.from("notification_worker").upsert({ id: true, last_seen_at: new Date().toISOString() });
    if (error) throw new Error("Notification queue is unavailable. Apply migration 0009.");
  }
  const deadline = Date.now() + 45000;
  let processed = 0;
  for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
    const { data, error } = await db.rpc("claim_event_notification_batch", {
      p_notification_id: notificationId ?? null, p_limit: 20,
    });
    if (error) throw new Error("Could not claim notification queue.");
    const deliveries = (data ?? []) as Delivery[];
    if (!deliveries.length) break;
    for (let i = 0; i < deliveries.length; i += 5) {
      // Finish every reserved recipient even if saving one result fails.
      const results = await Promise.allSettled(deliveries.slice(i, i + 5).map((row) => deliver(db, row)));
      if (results.some((result) => result.status === "rejected")) console.error("[event-notifications] Some delivery statuses could not be saved.");
      processed += results.length;
    }
  }
  return { processed };
}
