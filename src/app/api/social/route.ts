import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activityOpen, enrolledIn } from "@/lib/pre-event";

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
  const { data: activity } = await supabase.from("activities")
    .select("kind, pre_event, concert:concerts!activities_concert_id_fkey(id, date, doors_at)").eq("id", activity_id).maybeSingle();
  const concert = activity && (Array.isArray(activity.concert) ? activity.concert[0] : activity.concert);
  if (!activity || !concert || activity.kind !== "social") return NextResponse.json({ ok: false, message: "Unknown activity" }, { status: 404 });
  if (!activityOpen(activity, concert)) return NextResponse.json({ ok: false, message: "Pre-event tasks closed when doors opened" }, { status: 409 });
  // RLS limits bands/invites to the fan's own rows, so this checks their enrollment.
  if (!(await enrolledIn(supabase, user.id, concert.id))) return NextResponse.json({ ok: false, message: "Join this event first" }, { status: 403 });
  const { error } = await supabase
    .from("social_posts")
    .insert({ user_id: user.id, activity_id, url: parsed.toString(), status: "pending" });
  if (error) {
    const msg = error.code === "23505" ? "You already submitted this one" : error.message;
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
