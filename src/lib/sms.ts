/**
 * Outbound SMS. Provider picked by env:
 *   TEXTBELT_KEY   -> textbelt.com (cheap, any US/CA number, custom text; "textbelt" = 1 free/day)
 *   TWILIO_*       -> Twilio Programmable Messaging
 * Nothing set or SMS_NOTIFICATIONS !== "true" -> no-op (in-app inbox still works).
 */
export type SmsResult = { ok: boolean; provider: "textbelt" | "twilio" | "none"; error?: string; quota?: number };

export function smsEnabled(): boolean {
  return process.env.SMS_NOTIFICATIONS === "true" && (!!process.env.TEXTBELT_KEY || !!process.env.TWILIO_ACCOUNT_SID);
}

export async function sendSms(to: string, body: string, opts: { force?: boolean } = {}): Promise<SmsResult> {
  if (!opts.force && process.env.SMS_NOTIFICATIONS !== "true") return { ok: false, provider: "none", error: "SMS_NOTIFICATIONS is off" };

  if (process.env.TEXTBELT_KEY) {
    try {
      const r = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: to, message: body, key: process.env.TEXTBELT_KEY, sender: "BandDrop" }),
      });
      const j = (await r.json()) as { success: boolean; error?: string; quotaRemaining?: number };
      if (!j.success) console.error("[sms] textbelt:", j.error);
      return { ok: j.success, provider: "textbelt", error: j.error, quota: j.quotaRemaining };
    } catch (err) {
      console.error("[sms] textbelt failed", err);
      return { ok: false, provider: "textbelt", error: String(err) };
    }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (sid && token && from) {
    try {
      const { default: twilio } = await import("twilio");
      await twilio(sid, token).messages.create({ to, from, body });
      return { ok: true, provider: "twilio" };
    } catch (err) {
      console.error("[sms] twilio failed", err);
      return { ok: false, provider: "twilio", error: String(err) };
    }
  }
  return { ok: false, provider: "none", error: "No SMS provider configured" };
}
