import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Daily: flag unclaimed bands 30 days after their concert. Vercel cron sends CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("archive_expired_bands");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, archived: data });
}
