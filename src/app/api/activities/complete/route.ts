import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activityOpen, enrolledIn } from "@/lib/pre-event";

/** Fan answers a song-request activity. POST { activity_id, response }. Points land on submit. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  const { activity_id, response } = (await req.json().catch(() => ({}))) as { activity_id?: string; response?: string };
  const text = typeof response === "string" ? response.trim().slice(0, 120) : "";
  if (!activity_id || !text) return NextResponse.json({ ok: false, message: "Enter a song" }, { status: 400 });

  const db = createAdminClient();
  const { data: activity } = await db.from("activities")
    .select("id, kind, pre_event, concert:concerts!activities_concert_id_fkey(id, date, doors_at)").eq("id", activity_id).maybeSingle();
  const concert = activity && (Array.isArray(activity.concert) ? activity.concert[0] : activity.concert);
  if (!activity || !concert || activity.kind !== "song_request") return NextResponse.json({ ok: false, message: "Unknown activity" }, { status: 404 });
  if (!activityOpen(activity, concert)) return NextResponse.json({ ok: false, message: "Pre-event tasks closed when doors opened" }, { status: 409 });
  if (!(await enrolledIn(db, user.id, concert.id))) return NextResponse.json({ ok: false, message: "Join this event first" }, { status: 403 });

  const { error } = await db.from("activity_completions").insert({ user_id: user.id, activity_id, response: text });
  if (error) {
    return NextResponse.json({ ok: false, message: error.code === "23505" ? "You already sent a request" : "Could not save" }, { status: error.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
