import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEventNotifications } from "@/lib/event-notifications";

export const maxDuration = 120;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...await runEventNotifications(createAdminClient()) });
  } catch {
    return NextResponse.json({ ok: false, message: "Notification worker failed." }, { status: 503 });
  }
}

export const GET = POST;
