import { NextResponse } from "next/server";
import { findOrCreateArtist } from "@/lib/artists";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

/** GET: all events with activities, artists, and band counts. */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();
  const [{ data: concerts }, { data: activities }, { data: artists }, { data: bands }] = await Promise.all([
    db.from("concerts").select("*").order("date", { ascending: false }),
    db.from("activities").select("*").order("points"),
    db.from("artists").select("id, slug, name, kind, bio, image_url, access_code").order("name"),
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
    activities?: { name: string; points: number; location?: string; kind?: "scan" | "social" | "song_request"; social_network?: string; pre_event?: boolean }[];
  };
  const name = (b.name ?? "").trim();
  const venue = (b.venue ?? "").trim();
  if (!name || !venue || !b.date) {
    return NextResponse.json({ ok: false, message: "Name, location and date are required" }, { status: 400 });
  }
  const acts = (b.activities ?? [])
    .map((a) => ({
      name: (a.name ?? "").trim(),
      points: Math.max(0, Math.round(Number(a.points) || 0)),
      location: a.location?.trim() || null,
      kind: a.kind === "social" || a.kind === "song_request" ? a.kind : "scan",
      social_network: a.kind === "social" ? a.social_network ?? "instagram" : null,
      pre_event: !!a.pre_event && (a.kind === "social" || a.kind === "song_request"),
    }))
    .filter((a) => a.name);
  if (!acts.length) return NextResponse.json({ ok: false, message: "Add at least one activity" }, { status: 400 });

  const db = createAdminClient();
  let artistId = b.artist_id ?? null;
  let artistName = "";
  if (!artistId && b.new_artist?.name?.trim()) {
    const found = await findOrCreateArtist(db, b.new_artist.name, b.new_artist.kind ?? "artist");
    if (!found.artist) return NextResponse.json({ ok: false, message: found.error }, { status: 400 });
    artistId = found.artist.id;
    artistName = found.artist.name;
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

/**
 * PATCH: { id, ...fields } edits an event. Fields: name, description, venue, address, date, doors_at,
 * artist_id, image_url, venue_image_url, map_image_url, live_activity_id (sets the live station).
 */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    live_activity_id?: string | null;
    name?: string;
    description?: string;
    venue?: string;
    address?: string | null;
    date?: string;
    doors_at?: string | null;
    artist_id?: string | null;
    artist_name?: string | null;
    image_url?: string | null;
    venue_image_url?: string | null;
    map_image_url?: string | null;
  };
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();

  const fields: Record<string, unknown> = {};
  if (b.name !== undefined) fields.name = String(b.name).trim().slice(0, 120);
  if (b.description !== undefined) fields.description = String(b.description).trim().slice(0, 600);
  if (b.venue !== undefined) fields.venue = String(b.venue).trim().slice(0, 120);
  if (b.address !== undefined) fields.address = b.address ? String(b.address).trim().slice(0, 160) : null;
  if (b.date !== undefined) fields.date = b.date;
  if (b.doors_at !== undefined) fields.doors_at = b.doors_at ? String(b.doors_at).trim().slice(0, 20) : null;
  if (b.image_url !== undefined) fields.image_url = b.image_url || null;
  if (b.venue_image_url !== undefined) fields.venue_image_url = b.venue_image_url || null;
  if (b.map_image_url !== undefined) fields.map_image_url = b.map_image_url || null;
  if (b.artist_name !== undefined) {
    // Typed in the event editor: blank clears it, otherwise match or create the artist.
    if (!b.artist_name?.trim()) fields.artist_id = null;
    else {
      const found = await findOrCreateArtist(db, b.artist_name);
      if (!found.artist) return NextResponse.json({ ok: false, message: found.error }, { status: 400 });
      fields.artist_id = found.artist.id;
      fields.artist = found.artist.name;
    }
  }
  if (b.artist_id !== undefined) {
    fields.artist_id = b.artist_id || null;
    if (b.artist_id) {
      const { data: a } = await db.from("artists").select("name").eq("id", b.artist_id).maybeSingle();
      if (a) fields.artist = a.name;
    }
  }
  if (fields.name === "" || fields.venue === "") return NextResponse.json({ ok: false, message: "Name and venue required" }, { status: 400 });
  if (Object.keys(fields).length) {
    const { error } = await db.from("concerts").update(fields).eq("id", b.id);
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  if (b.live_activity_id === undefined) return NextResponse.json({ ok: true });

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

/** DELETE ?id=… removes an event and everything under it (activities, bands, scans). */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error, count } = await db.from("concerts").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
