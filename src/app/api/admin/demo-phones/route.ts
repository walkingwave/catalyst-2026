import { NextResponse } from "next/server";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { normalizePhone } from "@/lib/phone";
import { getTestOtps, setTestOtps } from "@/lib/supabase/management";

export const runtime = "nodejs";
const DEMO_CODE = "123456";

/** GET: demo phones that sign in with a fixed code and no SMS. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  if (!process.env.SUPABASE_ACCESS_TOKEN) return NextResponse.json({ ok: false, configured: false, message: "SUPABASE_ACCESS_TOKEN not set" });
  try {
    const data = await getTestOtps();
    return NextResponse.json({ ok: true, configured: true, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, configured: true, message: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}

/** POST { phone } adds a demo phone (code 123456). DELETE ?phone=… removes one. */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const { phone: raw } = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = normalizePhone(raw ?? "");
  if (!phone) return NextResponse.json({ ok: false, message: "Enter a valid phone number" }, { status: 400 });
  try {
    const { otps } = await getTestOtps();
    const bare = phone.replace(/^\+/, "");
    const next = [...otps.filter((t) => t.phone !== bare), { phone: bare, code: DEMO_CODE }];
    await setTestOtps(next);
    return NextResponse.json({ ok: true, phone, code: DEMO_CODE, count: next.length });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const phone = normalizePhone(new URL(req.url).searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ ok: false, message: "phone required" }, { status: 400 });
  try {
    const { otps } = await getTestOtps();
    const bare = phone.replace(/^\+/, "");
    await setTestOtps(otps.filter((t) => t.phone !== bare));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
