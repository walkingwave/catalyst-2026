import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET ?id=<user_id>: one fan's detail for this artist: shows, scans, and the messages/drops they've received from us. */
export async function GET(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();

  const [{ data: user }, { data: concerts }] = await Promise.all([
    db.from("users").select("id, name, phone, instagram, tiktok, x_handle, created_at").eq("id", id).maybeSingle(),
    db.from("concerts").select("id, name, venue, date").eq("artist_id", artist.id),
  ]);
  if (!user) return NextResponse.json({ ok: false, message: "Fan not found" }, { status: 404 });
  const concertIds = (concerts ?? []).map((c) => c.id);

  const [{ data: bands }, { data: messages }, { data: drops }, { data: pool }] = await Promise.all([
    concertIds.length ? db.from("bands").select("uid, concert_id, claimed_at").eq("user_id", id).in("concert_id", concertIds) : Promise.resolve({ data: [] }),
    db.from("messages").select("id, channel, body, sms_status, created_at").eq("artist_id", artist.id).eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("drops").select("id, title, code, claimed_at, created_at").eq("artist_id", artist.id).eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("user_artist_points").select("earned, spent, balance").eq("user_id", id).eq("artist_id", artist.id).maybeSingle(),
  ]);
  const uids = (bands ?? []).map((b) => b.uid);
  const { data: scans } = uids.length
    ? await db.from("scans").select("band_uid, scanned_at, activity:activities(name, points, concert_id)").in("band_uid", uids).order("scanned_at", { ascending: false })
    : { data: [] };
  const concertBy = new Map((concerts ?? []).map((c) => [c.id, c]));

  return NextResponse.json({
    ok: true,
    fan: {
      id: user.id,
      name: user.name,
      phone_hint: user.phone ? `···${user.phone.slice(-4)}` : null,
      has_phone: !!user.phone,
      instagram: user.instagram,
      tiktok: user.tiktok,
      x_handle: user.x_handle,
      since: user.created_at,
      points: pool ?? { earned: 0, spent: 0, balance: 0 },
      shows: (bands ?? []).map((b) => ({ ...concertBy.get(b.concert_id)!, band_uid: b.uid, claimed_at: b.claimed_at })),
      scans: (scans ?? []).map((s) => {
        const a = Array.isArray(s.activity) ? s.activity[0] : s.activity;
        return { name: a?.name, points: a?.points, at: s.scanned_at, show: concertBy.get(a?.concert_id ?? "")?.name };
      }),
      messages: messages ?? [],
      drops: drops ?? [],
    },
  });
}
