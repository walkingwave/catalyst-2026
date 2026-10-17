import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { id, status: "approved" | "rejected" } — only for posts on this artist's shows. */
export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const { id, status } = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!id || (status !== "approved" && status !== "rejected")) {
    return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: post } = await db
    .from("social_posts")
    .select("id, activity:activities!inner(concert:concerts!inner(artist_id))")
    .eq("id", id)
    .maybeSingle();
  const act = post && (Array.isArray(post.activity) ? post.activity[0] : post.activity);
  const concert = act && (Array.isArray(act.concert) ? act.concert[0] : act.concert);
  if (!post || concert?.artist_id !== artist.id) {
    return NextResponse.json({ ok: false, message: "Not your post" }, { status: 404 });
  }
  const { error } = await db
    .from("social_posts")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
