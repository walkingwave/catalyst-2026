import type { SupabaseClient } from "@supabase/supabase-js";
import { isFictionalPhone, sendSms, smsEnabled, smsWithOptOut } from "@/lib/sms";

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

/** Alerts always send immediately; there is no scheduling. */
export function parseEventNotification(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Invalid alert.");
  const b = input as Record<string, unknown>;
  if (!isUuid(b.id) || !isUuid(b.concert_id)) throw new Error("Select an event.");
  if (typeof b.body !== "string" || !b.body.trim() || b.body.trim().length > 320) throw new Error("Enter a message of 1–320 characters.");
  if (b.channel !== "sms" && b.channel !== "inbox") throw new Error("Choose SMS or Inbox.");
  return { id: b.id, concert_id: b.concert_id, body: b.body.trim(), channel: b.channel, scheduled_at: null };
}

type Delivery = { delivery_id: string; user_id: string; phone: string | null; body: string; channel: "inbox" | "sms"; event_name: string };

async function deliver(db: SupabaseClient, delivery: Delivery) {
  let status = "sent";
  let error: string | null = null;
  if (delivery.channel === "sms") {
    if (!smsEnabled() || !delivery.phone || isFictionalPhone(delivery.phone)) {
      status = "skipped";
      error = !delivery.phone ? "No phone number" : !smsEnabled() ? "SMS is disabled" : "Demo number, no text sent";
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

/** Sends one alert to completion. Database reservations stop concurrent calls from duplicating a send. */
export async function runEventNotifications(db: SupabaseClient, notificationId: string, budgetMs = 100000) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (Date.now() < deadline) {
    const { data, error } = await db.rpc("claim_event_notification_batch", {
      p_notification_id: notificationId, p_limit: 20,
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
