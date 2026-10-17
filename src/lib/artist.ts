import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve the artist console caller from the x-artist-code header. */
export async function artistFromRequest(req: Request) {
  const code = req.headers.get("x-artist-code")?.trim();
  if (!code) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("artists")
    .select("id, slug, name, kind, image_url, bio")
    .eq("access_code", code)
    .maybeSingle();
  return data ?? null;
}
