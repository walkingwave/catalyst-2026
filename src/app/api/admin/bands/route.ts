import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { normalizeUid, isValidUid } from "@/lib/uid";

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** GET ?uid=… (one band with scans) or ?concert=… (bands for an event). */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const db = createAdminClient();

  const uid = normalizeUid(url.searchParams.get("uid") ?? "");
  if (uid) {
    const { data: band } = await db
      .from("bands")
      .select("*, owner:users(name, phone), concert:concerts(name, artist)")
      .eq("uid", uid)
      .maybeSingle();
    if (!band) return NextResponse.json({ ok: true, band: null, uid, tag_url: `${SITE()}/b/${uid}` });
    const { data: scans } = await db
      .from("scans")
      .select("id, scanned_at, activity:activities(name, points)")
      .eq("band_uid", uid)
      .order("scanned_at", { ascending: false });
    return NextResponse.json({
      ok: true,
      uid,
      tag_url: `${SITE()}/b/${uid}`,
      band: {
        ...band,
        owner: Array.isArray(band.owner) ? band.owner[0] : band.owner,
        concert: Array.isArray(band.concert) ? band.concert[0] : band.concert,
        scans: (scans ?? []).map((s) => ({ ...s, activity: Array.isArray(s.activity) ? s.activity[0] : s.activity })),
      },
    });
  }

  const concert = url.searchParams.get("concert");
  if (concert) {
    const { data } = await db
      .from("bands")
      .select("uid, user_id, claimed_at, archived, created_at, owner:users(name)")
      .eq("concert_id", concert)
      .order("created_at", { ascending: false })
      .limit(200);
    const { data: counts } = await db.from("band_points").select("band_uid, points, activity_count").eq("concert_id", concert);
    const pts = new Map((counts ?? []).map((c) => [c.band_uid, c]));
    return NextResponse.json({
      ok: true,
      bands: (data ?? []).map((b) => ({
        ...b,
        owner: Array.isArray(b.owner) ? b.owner[0] : b.owner,
        points: pts.get(b.uid)?.points ?? 0,
        activity_count: pts.get(b.uid)?.activity_count ?? 0,
      })),
    });
  }
  return NextResponse.json({ ok: false, message: "uid or concert required" }, { status: 400 });
}

/**
 * POST: register or move a band. { uid, concert_id }
 * New UID -> created. Existing -> concert reassigned (scans from the old concert are kept).
 */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { uid?: string; concert_id?: string };
  const uid = normalizeUid(b.uid ?? "");
  if (!isValidUid(uid) || !b.concert_id) return NextResponse.json({ ok: false, message: "uid and concert_id required" }, { status: 400 });
  const db = createAdminClient();
  const { data: existing } = await db.from("bands").select("uid, concert_id, user_id").eq("uid", uid).maybeSingle();
  const { error } = existing
    ? await db.from("bands").update({ concert_id: b.concert_id, archived: false }).eq("uid", uid)
    : await db.from("bands").insert({ uid, concert_id: b.concert_id });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    uid,
    status: existing ? (existing.concert_id === b.concert_id ? "already" : "moved") : "created",
    claimed: !!existing?.user_id,
    tag_url: `${SITE()}/b/${uid}`,
  });
}

/** PATCH: { uid, action: "unclaim" | "archive" | "restore" | "clear_scans" | "reset" } (reset = clear scans + unclaim + unarchive) */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { uid?: string; action?: string };
  const uid = normalizeUid(b.uid ?? "");
  if (!isValidUid(uid)) return NextResponse.json({ ok: false, message: "Bad uid" }, { status: 400 });
  const db = createAdminClient();
  let error = null;
  switch (b.action) {
    case "unclaim":
      ({ error } = await db.from("bands").update({ user_id: null, claimed_at: null }).eq("uid", uid));
      break;
    case "archive":
      ({ error } = await db.from("bands").update({ archived: true }).eq("uid", uid));
      break;
    case "restore":
      ({ error } = await db.from("bands").update({ archived: false }).eq("uid", uid));
      break;
    case "clear_scans":
      ({ error } = await db.from("scans").delete().eq("band_uid", uid));
      break;
    case "reset": {
      const { error: e1 } = await db.from("scans").delete().eq("band_uid", uid);
      const { error: e2 } = await db.from("bands").update({ user_id: null, claimed_at: null, archived: false }).eq("uid", uid);
      error = e1 ?? e2;
      break;
    }
    default:
      return NextResponse.json({ ok: false, message: "Unknown action" }, { status: 400 });
  }
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
