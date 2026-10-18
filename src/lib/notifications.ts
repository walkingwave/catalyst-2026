import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, smsEnabled, smsWithOptOut } from "@/lib/sms";
import { isDemoPhone } from "@/lib/phone";

type Notification = {
  artistId: string;
  userId: string;
  phone: string | null;
  body: string;
  smsBody?: string;
  sms: boolean;
  imageUrl?: string | null;
};

export type NotificationResult = {
  inbox: boolean;
  sms: "sent" | "failed" | "skipped" | "not_requested";
  statusSaved: boolean;
};

/** Persist the inbox first, then await provider acceptance and save its actual outcome.
 * "sent" means accepted by the provider, not confirmed handset delivery.
 * Do not retry automatically: a network timeout may occur after the provider accepted a text.
 */
export async function notifyFan(db: SupabaseClient, notification: Notification): Promise<NotificationResult> {
  const { artistId, userId, phone, body, sms } = notification;
  const enabled = smsEnabled();
  const demo = isDemoPhone(phone);
  const initialStatus = !sms ? null : !enabled ? "disabled" : !phone ? "no_phone" : demo ? "demo" : "pending";
  const { data: message, error } = await db.from("messages").insert({
    artist_id: artistId,
    user_id: userId,
    channel: sms ? "sms" : "inbox",
    body,
    image_url: notification.imageUrl ?? null,
    sms_status: initialStatus,
  }).select("id").single();

  if (error || !message) {
    console.error("[notifications] inbox insert failed", error?.code);
    return { inbox: false, sms: sms ? "failed" : "not_requested", statusSaved: false };
  }
  if (!sms || !enabled || !phone || demo) {
    return { inbox: true, sms: sms ? "skipped" : "not_requested", statusSaved: true };
  }

  const smsBody = await smsWithOptOut(db, userId, notification.smsBody ?? body);
  const result = await sendSms(phone, smsBody);
  const { error: statusError } = await db.from("messages").update({
    sms_status: result.ok ? "sent" : `failed: ${result.error ?? result.provider}`,
  }).eq("id", message.id);
  if (statusError) console.error("[notifications] status update failed", statusError.code);
  return { inbox: true, sms: result.ok ? "sent" : "failed", statusSaved: !statusError };
}

/** Bound provider concurrency and keep recipient results independent. */
export async function notifyFans(db: SupabaseClient, notifications: Notification[]) {
  const results: NotificationResult[] = [];
  for (let i = 0; i < notifications.length; i += 5) {
    results.push(...await Promise.all(notifications.slice(i, i + 5).map(async (notification) => {
      try {
        return await notifyFan(db, notification);
      } catch {
        console.error("[notifications] notification interrupted");
        return { inbox: false, sms: notification.sms ? "failed" : "not_requested", statusSaved: false } as NotificationResult;
      }
    })));
  }
  return {
    inbox: results.filter((r) => r.inbox).length,
    inbox_failed: results.filter((r) => !r.inbox).length,
    sms_sent: results.filter((r) => r.sms === "sent").length,
    sms_failed: results.filter((r) => r.sms === "failed").length,
    sms_skipped: results.filter((r) => r.sms === "skipped").length,
    status_failed: results.filter((r) => !r.statusSaved).length,
  };
}
