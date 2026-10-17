import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeUid, isValidUid } from "@/lib/uid";

export const runtime = "nodejs";

/**
 * POST /api/claim  body: { uid: string, name?: string }
 * Requires a signed-in session (cookie). Locks the band to the caller.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }

  let body: { uid?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const uid = normalizeUid(body.uid ?? "");
  if (!isValidUid(uid)) {
    return NextResponse.json({ ok: false, message: "Bad band id" }, { status: 400 });
  }

  const db = createAdminClient();

  // Make sure the users row exists and carries the name.
  const name = (body.name ?? "").trim().slice(0, 60);
  const { data: existingUser } = await db.from("users").select("id, name").eq("id", user.id).maybeSingle();
  if (!existingUser) {
    await db.from("users").insert({ id: user.id, name, phone: user.phone ? `+${user.phone.replace(/^\+/, "")}` : null });
  } else if (name && !existingUser.name) {
    await db.from("users").update({ name }).eq("id", user.id);
  }

  const { data: band } = await db
    .from("bands")
    .select("uid, user_id, archived")
    .eq("uid", uid)
    .maybeSingle();

  if (!band) {
    return NextResponse.json({ ok: false, message: "Unknown band" }, { status: 404 });
  }
  if (band.archived) {
    return NextResponse.json({ ok: false, message: "This band has expired" }, { status: 409 });
  }
  if (band.user_id && band.user_id !== user.id) {
    return NextResponse.json({ ok: false, message: "This band belongs to someone else" }, { status: 409 });
  }
  if (band.user_id === user.id) {
    return NextResponse.json({ ok: true, message: "Already yours" });
  }

  // Conditional update: only claim if still unclaimed (race safe).
  const { data: claimed, error } = await db
    .from("bands")
    .update({ user_id: user.id, claimed_at: new Date().toISOString() })
    .eq("uid", uid)
    .is("user_id", null)
    .select("uid")
    .maybeSingle();

  if (error || !claimed) {
    return NextResponse.json({ ok: false, message: "Band was just claimed by someone else" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, message: "Band claimed" });
}
