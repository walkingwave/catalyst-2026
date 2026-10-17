import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

/** Concerts + activities for the staff station picker. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const db = createAdminClient();
  const [{ data: concerts }, { data: activities }] = await Promise.all([
    db.from("concerts").select("id, name, artist, venue, date").order("date", { ascending: false }),
    db.from("activities").select("id, concert_id, name, points").order("points"),
  ]);
  return NextResponse.json({ ok: true, concerts: concerts ?? [], activities: activities ?? [] });
}
