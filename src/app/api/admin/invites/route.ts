import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/event-notifications";

const denied = () => NextResponse.json({ ok: false }, { status: 401 });
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
// No 0/O/1/I so codes read cleanly off a ticket email.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** GET ?concert_id=… lists the event's invites with who redeemed them. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const concertId = new URL(req.url).searchParams.get("concert_id");
  if (!isUuid(concertId)) return fail("Select an event.");
  const { data, error } = await createAdminClient().from("event_invites")
    .select("code, label, redeemed_at, created_at, user:users(name, phone)")
    .eq("concert_id", concertId).order("created_at", { ascending: false });
  if (error) return fail("Could not load invites.", 500);
  return NextResponse.json({ ok: true, invites: (data ?? []).map((i) => ({ ...i, user: Array.isArray(i.user) ? i.user[0] ?? null : i.user })) });
}

/** POST { concert_id, labels: string[] } creates one single-use invite per ticket buyer (label = name or email). */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const body = (await req.json().catch(() => ({}))) as { concert_id?: string; labels?: unknown };
  if (!isUuid(body.concert_id)) return fail("Select an event.");
  const labels = Array.isArray(body.labels) ? body.labels.map((l) => String(l).trim().slice(0, 80)).filter(Boolean) : [];
  if (!labels.length || labels.length > 500) return fail("Add 1–500 buyers, one per line.");
  const rows = labels.map((label) => ({ code: newCode(), concert_id: body.concert_id, label }));
  const { error } = await createAdminClient().from("event_invites").insert(rows);
  if (error) return fail("Could not create invites.", 500);
  return NextResponse.json({ ok: true, created: rows.length }, { status: 201 });
}

/** DELETE ?code=… revokes an unused invite. */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const { data, error } = await createAdminClient().from("event_invites").delete().eq("code", code).is("redeemed_by", null).select("code");
  if (error) return fail("Could not revoke invite.", 500);
  if (!data?.length) return fail("Invite not found or already used.", 409);
  return NextResponse.json({ ok: true });
}
