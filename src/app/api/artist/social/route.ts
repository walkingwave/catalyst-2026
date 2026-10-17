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
  const { data: post } = await db.from("social_posts").select("id, activity_id, status").eq("id", id).maybeSingle();
  const { data: act } = post ? await db.from("activities").select("concert_id").eq("id", post.activity_id).maybeSingle() : { data: null };
  const { data: concert } = act ? await db.from("concerts").select("artist_id").eq("id", act.concert_id).maybeSingle() : { data: null };
  if (!post || !concert || concert.artist_id !== artist.id) {
    return NextResponse.json({ ok: false, message: "Not your post" }, { status: 404 });
  }
  if (post.status !== "pending") {
    return NextResponse.json({ ok: false, message: `Already ${post.status}` }, { status: 409 });
  }
  const { error } = await db
    .from("social_posts")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
