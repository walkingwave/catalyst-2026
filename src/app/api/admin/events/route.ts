import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

/** GET: all events with activities, artists, and band counts. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();
  const [{ data: concerts }, { data: activities }, { data: artists }, { data: bands }] = await Promise.all([
    db.from("concerts").select("*").order("date", { ascending: false }),
    db.from("activities").select("*").order("points"),
    db.from("artists").select("id, slug, name, kind").order("name"),
    db.from("bands").select("uid, concert_id, user_id, archived"),
  ]);
  const counts = new Map<string, { total: number; claimed: number }>();
  for (const b of bands ?? []) {
    const c = counts.get(b.concert_id) ?? { total: 0, claimed: 0 };
    c.total++;
    if (b.user_id) c.claimed++;
    counts.set(b.concert_id, c);
  }
  return NextResponse.json({
    ok: true,
    artists: artists ?? [],
    events: (concerts ?? []).map((c) => ({
      ...c,
      activities: (activities ?? []).filter((a) => a.concert_id === c.id),
      bands: counts.get(c.id) ?? { total: 0, claimed: 0 },
    })),
  });
}

/**
 * POST: create an event.
 * { name, description?, venue, address?, date, doors_at?, artist_id? | new_artist?: { name, kind },
 *   activities: [{ name, points, location? }] }
 */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    venue?: string;
    address?: string;
    date?: string;
    doors_at?: string;
    artist_id?: string;
    new_artist?: { name: string; kind?: "artist" | "team" };
    activities?: { name: string; points: number; location?: string }[];
  };
  const name = (b.name ?? "").trim();
  const venue = (b.venue ?? "").trim();
  if (!name || !venue || !b.date) {
    return NextResponse.json({ ok: false, message: "Name, location and date are required" }, { status: 400 });
  }
  const acts = (b.activities ?? [])
    .map((a) => ({ name: (a.name ?? "").trim(), points: Math.max(0, Math.round(Number(a.points) || 0)), location: a.location?.trim() || null }))
    .filter((a) => a.name);
  if (!acts.length) return NextResponse.json({ ok: false, message: "Add at least one activity" }, { status: 400 });

  const db = createAdminClient();
  let artistId = b.artist_id ?? null;
  let artistName = "";
  if (!artistId && b.new_artist?.name?.trim()) {
    const an = b.new_artist.name.trim();
    const slug = an.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { data: a, error } = await db
      .from("artists")
      .upsert({ slug, name: an, kind: b.new_artist.kind ?? "artist", access_code: `${slug.toUpperCase().replace(/-/g, "")}${new Date().getFullYear()}` }, { onConflict: "slug" })
      .select("id, name")
      .single();
    if (error || !a) return NextResponse.json({ ok: false, message: error?.message ?? "Artist failed" }, { status: 500 });
    artistId = a.id;
    artistName = a.name;
  } else if (artistId) {
    const { data: a } = await db.from("artists").select("name").eq("id", artistId).maybeSingle();
    artistName = a?.name ?? "";
  }

  const { data: concert, error: cErr } = await db
    .from("concerts")
    .insert({
      name,
      artist: artistName || name,
      artist_id: artistId,
      venue,
      address: b.address?.trim() || null,
      date: b.date,
      doors_at: b.doors_at?.trim() || null,
      description: b.description?.trim() ?? "",
    })
    .select()
    .single();
  if (cErr || !concert) return NextResponse.json({ ok: false, message: cErr?.message ?? "Event failed" }, { status: 500 });

  // Spread pins across the floor plan so the venue map has something to show.
  const spots = [[50, 91], [22, 80], [78, 80], [15, 46], [84, 14], [50, 60], [30, 30], [70, 30]];
  const { data: created, error: aErr } = await db
    .from("activities")
    .insert(acts.map((a, i) => ({ ...a, concert_id: concert.id, map_x: spots[i % spots.length][0], map_y: spots[i % spots.length][1] })))
    .select();
  if (aErr) return NextResponse.json({ ok: false, message: aErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, event: { ...concert, activities: created ?? [] } });
}

/** PATCH: { id, live_activity_id: string | null } sets the live station for an event. */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; live_activity_id?: string | null };
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  if (b.live_activity_id) {
    const { data: a } = await db.from("activities").select("concert_id").eq("id", b.live_activity_id).maybeSingle();
    if (a?.concert_id !== b.id) return NextResponse.json({ ok: false, message: "Activity not in this event" }, { status: 400 });
    // Only one live station across all events keeps the demo unambiguous.
    await db.from("concerts").update({ live_activity_id: null }).not("live_activity_id", "is", null);
  }
  const { error } = await db.from("concerts").update({ live_activity_id: b.live_activity_id ?? null }).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
