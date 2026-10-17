import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Fan submits proof for a social activity. POST { activity_id, url } */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });

  const { activity_id, url } = (await req.json().catch(() => ({}))) as { activity_id?: string; url?: string };
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {}
  if (!activity_id || !parsed || !/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ ok: false, message: "Paste the link to your post" }, { status: 400 });
  }
  const { error } = await supabase
    .from("social_posts")
    .insert({ user_id: user.id, activity_id, url: parsed.toString(), status: "pending" });
  if (error) {
    const msg = error.code === "23505" ? "You already submitted this one" : error.message;
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
