import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { smsEnabled } from "@/lib/sms";

/** Everything the artist console needs in one call: top fans, shows, pending social posts, recent sends. */
export async function GET(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();

  const [{ data: lb }, { data: concerts }, { data: pending }, { data: messages }, { data: drops }, { data: templates }] =
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
      db.from("drop_templates").select("*").eq("artist_id", artist.id).order("created_at"),
    ]);

  // Attendance: every fan holding a claimed band at one of this artist's shows, even with 0 points yet.
  const concertIds = new Set((concerts ?? []).map((c) => c.id));
  // Invited ticket buyers count as fans before they pick up a wristband.
  const [{ data: bandRows }, { data: inviteRows }, { data: requestRows }] = concertIds.size
    ? await Promise.all([
        db.from("bands").select("user_id, concert_id").in("concert_id", [...concertIds]).not("user_id", "is", null),
        db.from("event_invites").select("user_id:redeemed_by, concert_id").in("concert_id", [...concertIds]).not("redeemed_by", "is", null),
        db.from("activity_completions").select("response, activity:activities!inner(id, name, concert_id, kind)").in("activity.concert_id", [...concertIds]).eq("activity.kind", "song_request"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const attendance = [...(bandRows ?? []), ...(inviteRows ?? [])];
  // Song requests grouped per activity, most-requested first (case-insensitive).
  const requestBy = new Map<string, { activity_id: string; activity: string; concert_id: string; songs: Map<string, { song: string; count: number }> }>();
  for (const r of requestRows ?? []) {
    const a = Array.isArray(r.activity) ? r.activity[0] : r.activity;
    if (!a) continue;
    const group = requestBy.get(a.id) ?? { activity_id: a.id, activity: a.name, concert_id: a.concert_id, songs: new Map() };
    const key = r.response.trim().toLowerCase();
    const song = group.songs.get(key) ?? { song: r.response.trim(), count: 0 };
    song.count++;
    group.songs.set(key, song);
    requestBy.set(a.id, group);
  }
  const songRequests = [...requestBy.values()].map((g) => ({ ...g, songs: [...g.songs.values()].sort((a, b) => b.count - a.count) }));
  const showsBy = new Map<string, Set<string>>();
  for (const b of attendance) {
    if (!showsBy.has(b.user_id!)) showsBy.set(b.user_id!, new Set());
    showsBy.get(b.user_id!)!.add(b.concert_id);
  }
  const pointsBy = new Map((lb ?? []).map((r) => [r.user_id, r]));
  const ids = [...new Set([...showsBy.keys(), ...pointsBy.keys()])];
  const { data: fans } = ids.length
    ? await db.from("users").select("id, name, phone, instagram, tiktok, x_handle").in("id", ids)
    : { data: [] };
  const fanBy = new Map((fans ?? []).map((f) => [f.id, f]));

  const merged = ids
    .map((id) => ({ user_id: id, name: pointsBy.get(id)?.name ?? fanBy.get(id)?.name ?? "", points: pointsBy.get(id)?.points ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = -1;
  const topFans = merged.map((r, i) => {
    if (r.points !== prev) {
      rank = i + 1;
      prev = r.points;
    }
    const f = fanBy.get(r.user_id);
    return {
      user_id: r.user_id,
      name: r.name,
      points: r.points,
      rank,
      shows: showsBy.get(r.user_id)?.size ?? 0,
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
    sms_enabled: smsEnabled(),
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
    song_requests: songRequests,
    pending_posts: (pending ?? [])
      .map((p) => ({
        ...p,
        user: Array.isArray(p.user) ? p.user[0] : p.user,
        activity: Array.isArray(p.activity) ? p.activity[0] : p.activity,
      }))
      .filter((p) => p.activity && concertIds.has(p.activity.concert_id)),
    messages: (messages ?? []).map((m) => ({ ...m, user: Array.isArray(m.user) ? m.user[0] : m.user })),
    drops: (drops ?? []).map((d) => ({ ...d, user: Array.isArray(d.user) ? d.user[0] : d.user })),
    templates: templates ?? [],
  });
}
