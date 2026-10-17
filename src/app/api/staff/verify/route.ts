import { NextResponse } from "next/server";
import { checkStaffPin } from "@/lib/staff";

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (!checkStaffPin(pin)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
