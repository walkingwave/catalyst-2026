import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";

/**
 * Supabase Auth "Send SMS" hook (HTTPS). Supabase POSTs { user: { phone }, sms: { otp } } signed with
 * Standard Webhooks headers; we forward the code through our SMS provider (Textbelt or Twilio).
 * Configure: Supabase -> Authentication -> Hooks -> Send SMS -> HTTPS -> <site>/api/hooks/send-sms
 * Secret: the hook's "v1,whsec_…" value in SUPABASE_SMS_HOOK_SECRET.
 */
function verify(req: Request, raw: string): boolean {
  const secret = process.env.SUPABASE_SMS_HOOK_SECRET;
  if (!secret) return false;
  const id = req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("webhook-timestamp") ?? "";
  const sigHeader = req.headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min tolerance
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigHeader.split(" ").some((part) => {
    const sig = part.replace(/^v1,/, "");
    try {
      return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(req, raw)) {
    return NextResponse.json({ error: { http_code: 401, message: "bad signature" } }, { status: 401 });
  }
  let payload: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { http_code: 400, message: "bad json" } }, { status: 400 });
  }
  const phone = payload.user?.phone ? `+${payload.user.phone.replace(/^\+/, "")}` : null;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return NextResponse.json({ error: { http_code: 400, message: "missing phone or otp" } }, { status: 400 });

  // OTP always goes out when a provider exists, regardless of the notifications toggle.
  const res = await sendSms(phone, `${otp} is your ConcertConnect code.`, { force: true });
  if (!res.ok) {
    return NextResponse.json({ error: { http_code: 500, message: res.error ?? "send failed" } }, { status: 500 });
  }
  return NextResponse.json({});
}
