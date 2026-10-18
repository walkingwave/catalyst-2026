import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/event-notifications";
import { normalizePhone } from "@/lib/phone";
import { getTestOtps, setTestOtps, type TestOtp } from "@/lib/supabase/management";

export const runtime = "nodejs";
const DEMO_CODE = "123456";
const denied = () => NextResponse.json({ ok: false }, { status: 401 });
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const bare = (phone: string) => phone.replace(/^\+/, "");

type BandRow = { uid: string; user: { id: string; name: string | null; phone: string | null } | null };

/** Demo list is optional: without a management token, everyone still lists as "Real". */
async function demoOtps(): Promise<TestOtp[] | null> {
  if (!process.env.SUPABASE_ACCESS_TOKEN) return null;
  try {
    return (await getTestOtps()).otps;
  } catch {
    return null;
  }
}

/** GET ?concert_id=… lists every account with a claimed band at the event. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const concertId = new URL(req.url).searchParams.get("concert_id");
  if (!isUuid(concertId)) return fail("Select an event.");
  const [{ data, error }, otps] = await Promise.all([
    createAdminClient().from("bands").select("uid, user:users(id, name, phone)")
      .eq("concert_id", concertId).not("user_id", "is", null).order("claimed_at", { ascending: true }),
    demoOtps(),
  ]);
  if (error) return fail("Could not load people.", 500);
  const demo = new Set((otps ?? []).map((t) => t.phone));
  const people = new Map<string, { id: string; name: string; phone: string | null; bands: string[]; demo: boolean }>();
  for (const row of (data ?? []) as unknown as BandRow[]) {
    if (!row.user) continue;
    const person = people.get(row.user.id) ?? {
      id: row.user.id, name: row.user.name ?? "", phone: row.user.phone, bands: [],
      demo: !!row.user.phone && demo.has(bare(row.user.phone)),
    };
    person.bands.push(row.uid);
    people.set(row.user.id, person);
  }
  return NextResponse.json({ ok: true, people: [...people.values()], demo_available: otps !== null });
}

/** POST { concert_id, name, phone } creates a demo account that signs in with 123456 and holds a band here. */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const body = (await req.json().catch(() => ({}))) as { concert_id?: string; name?: string; phone?: string };
  const name = body.name?.trim() ?? "";
  const phone = normalizePhone(body.phone ?? "");
  if (!isUuid(body.concert_id)) return fail("Select an event.");
  if (!name || name.length > 60) return fail("Enter a name of 1–60 characters.");
  if (!phone) return fail("Enter a valid phone number.");
  const otps = await demoOtps();
  if (!otps) return fail("Demo logins need SUPABASE_ACCESS_TOKEN on the server.", 503);
  const db = createAdminClient();
  const created = await db.auth.admin.createUser({ phone: bare(phone), phone_confirm: true, user_metadata: { name } });
  if (created.error || !created.data.user) {
    return fail(created.error?.message.includes("already") ? "That phone number already has an account." : "Could not create the account.", 409);
  }
  const userId = created.data.user.id;
  try {
    await setTestOtps([...otps.filter((t) => t.phone !== bare(phone)), { phone: bare(phone), code: DEMO_CODE }]);
  } catch {
    await db.auth.admin.deleteUser(userId);
    return fail("Could not register the demo login. Try again.", 502);
  }
  // The auth trigger mirrors the account; set the name explicitly in case the row already existed.
  await db.from("users").update({ name, phone }).eq("id", userId);
  const uid = `DE${randomBytes(6).toString("hex").toUpperCase()}`;
  const band = await db.from("bands").insert({ uid, concert_id: body.concert_id, user_id: userId, claimed_at: new Date().toISOString() });
  if (band.error) return fail("Account created, but the band could not be assigned to this event.", 500);
  return NextResponse.json({ ok: true, person: { id: userId, name, phone, bands: [uid], demo: true }, code: DEMO_CODE }, { status: 201 });
}

/** PATCH { id, name?, phone? } edits any account. Demo logins follow a phone change. */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; phone?: string };
  if (!isUuid(body.id)) return fail("Select a person.");
  const db = createAdminClient();
  const { data: current, error } = await db.from("users").select("name, phone").eq("id", body.id).maybeSingle();
  if (error) return fail("Could not load this person.", 500);
  if (!current) return fail("Person not found.", 404);
  const name = body.name === undefined ? current.name : body.name.trim();
  if (!name || name.length > 60) return fail("Enter a name of 1–60 characters.");
  const phone = body.phone === undefined ? current.phone : normalizePhone(body.phone);
  if (!phone) return fail("Enter a valid phone number.");
  if (phone !== current.phone) {
    const otps = await demoOtps();
    const wasDemo = !!current.phone && !!otps?.some((t) => t.phone === bare(current.phone!));
    const updated = await db.auth.admin.updateUserById(body.id, { phone: bare(phone), phone_confirm: true });
    if (updated.error) return fail(updated.error.message.includes("already") ? "That phone number already has an account." : "Could not change the phone number.", 409);
    if (wasDemo && otps) {
      try {
        await setTestOtps([...otps.filter((t) => t.phone !== bare(current.phone!) && t.phone !== bare(phone)), { phone: bare(phone), code: DEMO_CODE }]);
      } catch {
        return fail("Phone changed, but the demo login could not be moved. Update it in Supabase → Auth → Test OTPs.", 502);
      }
    }
  }
  const saved = await db.from("users").update({ name, phone }).eq("id", body.id);
  if (saved.error) return fail("Could not save changes.", 500);
  return NextResponse.json({ ok: true });
}

/** DELETE ?id=… removes a demo account and its demo login. Real accounts are never deleted here. */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return fail("Select a person.");
  const db = createAdminClient();
  const { data: person } = await db.from("users").select("phone").eq("id", id).maybeSingle();
  if (!person) return fail("Person not found.", 404);
  const otps = await demoOtps();
  if (!person.phone || !otps?.some((t) => t.phone === bare(person.phone!))) return fail("Only demo accounts can be deleted here.", 403);
  try {
    await setTestOtps(otps.filter((t) => t.phone !== bare(person.phone!)));
  } catch {
    return fail("Could not remove the demo login. Try again.", 502);
  }
  await db.from("bands").delete().eq("user_id", id).like("uid", "DE%");
  const removed = await db.auth.admin.deleteUser(id);
  if (removed.error) return fail("Demo login removed, but the account could not be deleted.", 500);
  return NextResponse.json({ ok: true });
}
