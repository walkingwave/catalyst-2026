/** Optional post-scan SMS. No-op unless SMS_NOTIFICATIONS=true and Twilio env is set. */
export async function sendSms(to: string, body: string): Promise<void> {
  if (process.env.SMS_NOTIFICATIONS !== "true") return;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.warn("[sms] SMS_NOTIFICATIONS=true but Twilio env is incomplete");
    return;
  }
  try {
    const { default: twilio } = await import("twilio");
    await twilio(sid, token).messages.create({ to, from, body });
  } catch (err) {
    console.error("[sms] send failed", err);
  }
}
