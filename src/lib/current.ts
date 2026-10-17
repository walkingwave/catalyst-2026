import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import type { Artist } from "@/lib/types";

export const CURRENT_COOKIE = "cc_artist";

export type Attended = {
  artist: Artist;
  balance: number;
  earned: number;
  rank: number | null;
  shows: { id: string; name: string; venue: string; date: string; image_url: string | null }[];
};

/**
 * Everything the fan has tapped into, grouped by artist/team, with that artist's point pool.
 * `current` is the selected one: cookie if valid, else the artist of the most recent show.
 */
export async function attendedArtists(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [{ data: bands }, { data: pools }, { data: artists }, { data: ranks }] = await Promise.all([
    supabase.from("bands").select("concert:concerts(id, name, venue, date, image_url, artist_id)").eq("user_id", userId),
    supabase.from("user_artist_points").select("artist_id, balance, earned").eq("user_id", userId),
    supabase.from("artists").select("id, slug, name, kind, image_url, bio"),
    supabase.from("leaderboard_artist").select("artist_id, user_id, rank").eq("user_id", userId),
  ]);
  const artistBy = new Map(((artists ?? []) as Artist[]).map((a) => [a.id, a]));
  const byArtist = new Map<string, Attended>();
  for (const b of bands ?? []) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as { id: string; name: string; venue: string; date: string; image_url: string | null; artist_id: string | null } | null;
    if (!c?.artist_id) continue;
    const artist = artistBy.get(c.artist_id);
    if (!artist) continue;
    const row = byArtist.get(c.artist_id) ?? { artist, balance: 0, earned: 0, rank: null, shows: [] };
    if (!row.shows.some((s) => s.id === c.id)) row.shows.push({ id: c.id, name: c.name, venue: c.venue, date: c.date, image_url: c.image_url });
    byArtist.set(c.artist_id, row);
  }
  for (const p of pools ?? []) {
    const row = byArtist.get(p.artist_id);
    if (row) {
      row.balance = p.balance;
      row.earned = p.earned;
    }
  }
  for (const r of ranks ?? []) {
    const row = byArtist.get(r.artist_id);
    if (row) row.rank = r.rank;
  }
  const list = [...byArtist.values()];
  for (const row of list) row.shows.sort((a, b) => (a.date < b.date ? 1 : -1));
  list.sort((a, b) => (a.shows[0]?.date < b.shows[0]?.date ? 1 : -1)); // most recent show first

  const wanted = (await cookies()).get(CURRENT_COOKIE)?.value;
  const current = list.find((r) => r.artist.id === wanted) ?? list[0] ?? null;
  return { list, current };
}
