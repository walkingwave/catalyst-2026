import type { SupabaseClient } from "@supabase/supabase-js";

type Audience = { user_ids?: unknown; top?: unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only fans of this artist may be selected, including attendees with no points yet. */
export async function artistRecipients(db: SupabaseClient, artistId: string, audience: Audience) {
  if (audience.user_ids !== undefined && (!Array.isArray(audience.user_ids) ||
    audience.user_ids.length > 100 || audience.user_ids.some((id) => typeof id !== "string" || !uuid.test(id)))) {
    throw new Error("Select up to 100 fans.");
  }
  if (audience.top !== undefined && (typeof audience.top !== "number" ||
    !Number.isInteger(audience.top) || audience.top < 1 || audience.top > 100)) {
    throw new Error("Top fans must be between 1 and 100.");
  }
  const explicit = [...new Set((audience.user_ids ?? []) as string[])];
  if (!explicit.length && !audience.top) throw new Error("No recipients");

  const [{ data: ranked, error: rankError }, { data: concerts, error: concertError }] = await Promise.all([
    db.from("leaderboard_artist").select("user_id").eq("artist_id", artistId).order("rank"),
    db.from("concerts").select("id").eq("artist_id", artistId),
  ]);
  if (rankError || concertError) throw new Error("Could not load fans.");
  const { data: bands, error: bandError } = concerts?.length
    ? await db.from("bands").select("user_id").in("concert_id", concerts.map((c) => c.id)).not("user_id", "is", null)
    : { data: [], error: null };
  if (bandError) throw new Error("Could not load fans.");
  const allowed = new Set<string>([...(ranked ?? []).map((r) => r.user_id), ...(bands ?? []).map((b) => b.user_id)]);
  if (explicit.some((id) => !allowed.has(id))) throw new Error("Select fans from this artist's audience.");
  const ids = explicit.length ? explicit : [...allowed].slice(0, audience.top as number);
  if (!ids.length) throw new Error("No recipients");
  const { data: fans, error } = await db.from("users").select("id, phone").in("id", ids);
  if (error) throw new Error("Could not load fans.");
  if (!fans?.length) throw new Error("No recipients");
  return fans as { id: string; phone: string | null }[];
}
