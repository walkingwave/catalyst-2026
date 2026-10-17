import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";

/** Everything the artist console needs in one call: top fans, shows, pending social posts, recent sends. */
export async function GET(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();

  const [{ data: lb }, { data: concerts }, { data: pending }, { data: messages }, { data: drops }] =
    await Promise.all([
      db.from("leaderboard_artist").select("user_id, name, points, rank").eq("artist_id", artist.id).order("rank").limit(100),
      db.from("concerts").select("id, name, venue, date").eq("artist_id", artist.id).order("date", { ascending: false }),
      db
        .from("social_posts")
        .select("id, url, created_at, user:users(id, name, instagram, tiktok, x_handle), activity:activities(name, points, social_network, concert_id)")
        .eq("status", "pending")
        .order("created_at"),
      db.from("messages").select("id, channel, body, sms_status, created_at, user:users(name)").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(20),
      db.from("drops").select("id, title, code, claimed_at, created_at, user:users(name)").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(20),
    ]);

  // Fan details (socials, phone presence, shows attended) for the top fans list.
  const ids = (lb ?? []).map((r) => r.user_id);
  const { data: fans } = ids.length
    ? await db.from("users").select("id, phone, instagram, tiktok, x_handle").in("id", ids)
    : { data: [] };
  const { data: attendance } = ids.length
    ? await db
        .from("bands")
        .select("user_id, concert:concerts!inner(artist_id)")
        .in("user_id", ids)
        .eq("concert.artist_id", artist.id)
    : { data: [] };
  const showsBy = new Map<string, number>();
  for (const b of attendance ?? []) showsBy.set(b.user_id!, (showsBy.get(b.user_id!) ?? 0) + 1);
  const fanBy = new Map((fans ?? []).map((f) => [f.id, f]));

  const concertIds = new Set((concerts ?? []).map((c) => c.id));
  const topFans = (lb ?? []).map((r) => {
    const f = fanBy.get(r.user_id);
    return {
      user_id: r.user_id,
      name: r.name,
      points: r.points,
      rank: r.rank,
      shows: showsBy.get(r.user_id) ?? 0,
      has_phone: !!f?.phone,
      phone_hint: f?.phone ? `···${f.phone.slice(-4)}` : null,
      instagram: f?.instagram ?? null,
      tiktok: f?.tiktok ?? null,
      x_handle: f?.x_handle ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    artist,
    stats: {
      fans: topFans.length,
      shows: concerts?.length ?? 0,
      pending_posts: (pending ?? []).filter((p) => {
        const a = Array.isArray(p.activity) ? p.activity[0] : p.activity;
        return a && concertIds.has(a.concert_id);
      }).length,
    },
    top_fans: topFans,
    concerts: concerts ?? [],
    pending_posts: (pending ?? [])
      .map((p) => ({
        ...p,
        user: Array.isArray(p.user) ? p.user[0] : p.user,
        activity: Array.isArray(p.activity) ? p.activity[0] : p.activity,
      }))
      .filter((p) => p.activity && concertIds.has(p.activity.concert_id)),
    messages: (messages ?? []).map((m) => ({ ...m, user: Array.isArray(m.user) ? m.user[0] : m.user })),
    drops: (drops ?? []).map((d) => ({ ...d, user: Array.isArray(d.user) ? d.user[0] : d.user })),
  });
}
