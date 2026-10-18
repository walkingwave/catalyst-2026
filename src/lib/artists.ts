import type { SupabaseClient } from "@supabase/supabase-js";

export const artistSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Typed artist/team name -> artist row. Reuses an existing artist (same name or slug, case-insensitive) so its
 * rewards, console code and fan points stay intact; only a genuinely new name creates one.
 */
export async function findOrCreateArtist(db: SupabaseClient, rawName: string, kind: "artist" | "team" = "artist") {
  const name = rawName.trim().slice(0, 80);
  const slug = artistSlug(name);
  if (!name || !slug) return { error: "Enter an artist or team name" as const };
  const { data: existing } = await db.from("artists").select("id, name").or(`slug.eq.${slug},name.ilike.${name.replace(/[,()%_*]/g, "")}`).limit(1);
  if (existing?.[0]) return { artist: existing[0], created: false };
  const access_code = `${slug.toUpperCase().replace(/-/g, "")}${new Date().getFullYear()}`;
  const { data, error } = await db.from("artists").insert({ slug, name, kind, access_code }).select("id, name").single();
  if (error || !data) return { error: error?.message ?? "Could not create artist" };
  return { artist: data, created: true };
}
