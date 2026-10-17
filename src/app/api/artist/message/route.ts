import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

/**
 * POST { body, user_ids?: string[], top?: number, channel: "sms" | "inbox" }
 * Sends to explicit fans, or to the top N on this artist's leaderboard.
 * SMS goes out via Twilio only when SMS_NOTIFICATIONS=true; otherwise it is recorded as "simulated".
 */
export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const { body, user_ids, top, channel = "inbox" } = (await req.json().catch(() => ({}))) as {
    body?: string;
    user_ids?: string[];
    top?: number;
    channel?: "sms" | "inbox";
  };
  const text = (body ?? "").trim().slice(0, 320);
  if (!text) return NextResponse.json({ ok: false, message: "Message is empty" }, { status: 400 });

  const db = createAdminClient();
  let ids = user_ids ?? [];
  if (!ids.length && top) {
    const { data } = await db
      .from("leaderboard_artist")
      .select("user_id")
      .eq("artist_id", artist.id)
      .order("rank")
      .limit(Math.min(top, 100));
    ids = (data ?? []).map((r) => r.user_id);
  }
  if (!ids.length) return NextResponse.json({ ok: false, message: "No recipients" }, { status: 400 });

  const { data: fans } = await db.from("users").select("id, phone").in("id", ids);
  const live = process.env.SMS_NOTIFICATIONS === "true";
  const rows = [];
  for (const f of fans ?? []) {
    let sms_status: string | null = null;
    if (channel === "sms") {
      if (f.phone && live) {
        await sendSms(f.phone, `${artist.name}: ${text}`);
        sms_status = "sent";
      } else {
        sms_status = f.phone ? "simulated" : "no_phone";
      }
    }
    rows.push({ artist_id: artist.id, user_id: f.id, channel, body: text, sms_status });
  }
  const { error } = await db.from("messages").insert(rows);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sent: rows.length, live: channel === "sms" && live });
}
