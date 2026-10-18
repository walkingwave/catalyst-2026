import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoPhone } from "@/lib/phone";

/**
 * Outbound SMS. Provider picked by env:
 *   TEXTBELT_KEY   -> textbelt.com (cheap, any US/CA number, custom text; "textbelt" = 1 free/day)
 *   TWILIO_*       -> Twilio Programmable Messaging
 * Nothing set or SMS_NOTIFICATIONS !== "true" -> no-op (in-app inbox still works).
 */
export type SmsResult = { ok: boolean; provider: "textbelt" | "twilio" | "none"; error?: string; quota?: number };

const OPT_OUT_FOOTER = "\n\nReply STOP to unsubscribe.";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://banddrop.vercel.app").replace(/\/$/, "");

/**
 * Append a link back into BandDrop. Off unless SMS_LINK=true: Textbelt rejects URLs
 * from unverified keys ("ability to send URLs via text is limited to verified accounts").
 */
export function withSiteLink(body: string, path = "/dashboard"): string {
  if (process.env.SMS_LINK !== "true") return body;
  return `${body}\n${SITE}${path}`;
}

/** Failed, disabled and pending sends must not suppress the first successful send's notice. */
export async function smsWithOptOut(db: SupabaseClient, userId: string, body: string): Promise<string> {
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", "sms")
    .eq("sms_status", "sent");
  const linked = withSiteLink(body);
  return count ? linked : linked + OPT_OUT_FOOTER;
}

export function smsEnabled(): boolean {
  return process.env.SMS_NOTIFICATIONS === "true" && (
    !!process.env.TEXTBELT_KEY ||
    !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
  );
}

export async function sendSms(to: string, body: string, opts: { force?: boolean } = {}): Promise<SmsResult> {
  if (!opts.force && process.env.SMS_NOTIFICATIONS !== "true") return { ok: false, provider: "none", error: "SMS_NOTIFICATIONS is off" };
  if (isDemoPhone(to)) return { ok: false, provider: "none", error: "demo number" };

  if (process.env.TEXTBELT_KEY) {
    try {
      const r = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: to, message: body, key: process.env.TEXTBELT_KEY, sender: "BandDrop" }),
        signal: AbortSignal.timeout(opts.force ? 4000 : 8000),
      });
      const j = (await r.json()) as { success: boolean; error?: string; quotaRemaining?: number };
      if (!j.success) console.error("[sms] textbelt:", j.error);
      return { ok: j.success, provider: "textbelt", error: j.error, quota: j.quotaRemaining };
    } catch (err) {
      const error = err instanceof Error && err.name === "TimeoutError" ? "SMS request timed out; delivery unknown" : "SMS provider request failed";
      console.error("[sms]", error);
      return { ok: false, provider: "textbelt", error };
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (sid && token && from) {
    try {
      const { default: twilio } = await import("twilio");
      await twilio(sid, token, { timeout: opts.force ? 4000 : 8000, autoRetry: false }).messages.create({ to, from, body });
      return { ok: true, provider: "twilio" };
    } catch (err) {
      console.error("[sms] twilio failed", err);
      return { ok: false, provider: "twilio", error: String(err) };
    }
  }
  return { ok: false, provider: "none", error: "No SMS provider configured" };
}
