import { NextResponse } from "next/server";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/event-notifications";

export const runtime = "nodejs";

type BandRow = { uid: string; claimed_at: string | null; user: { id: string; name: string | null; phone: string | null } | null };

/** GET ?concert_id=… lists every account with a claimed band at the event. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const concertId = new URL(req.url).searchParams.get("concert_id");
  if (!isUuid(concertId)) return NextResponse.json({ ok: false, message: "Select an event." }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from("bands")
    .select("uid, claimed_at, user:users(id, name, phone)")
    .eq("concert_id", concertId).not("user_id", "is", null).order("claimed_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, message: "Could not load people." }, { status: 500 });
  const people = new Map<string, { id: string; name: string; phone: string | null; bands: string[]; claimed_at: string | null }>();
  for (const row of (data ?? []) as unknown as BandRow[]) {
    if (!row.user) continue;
    const person = people.get(row.user.id) ?? { id: row.user.id, name: row.user.name ?? "", phone: row.user.phone, bands: [], claimed_at: row.claimed_at };
    person.bands.push(row.uid);
    people.set(row.user.id, person);
  }
  return NextResponse.json({ ok: true, people: [...people.values()] });
}
