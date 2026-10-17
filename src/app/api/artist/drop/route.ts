import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms, smsEnabled } from "@/lib/sms";

/** POST { title, message?, code?, user_ids?: string[], top?: number, notify_sms?: boolean } */
export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    title?: string;
    message?: string;
    code?: string;
    user_ids?: string[];
    top?: number;
    notify_sms?: boolean;
  };
  const title = (b.title ?? "").trim().slice(0, 80);
  if (!title) return NextResponse.json({ ok: false, message: "Title is empty" }, { status: 400 });

  const db = createAdminClient();
  let ids = b.user_ids ?? [];
  if (!ids.length && b.top) {
    const { data } = await db
      .from("leaderboard_artist")
      .select("user_id")
      .eq("artist_id", artist.id)
      .order("rank")
      .limit(Math.min(b.top, 100));
    ids = (data ?? []).map((r) => r.user_id);
  }
  if (!ids.length) return NextResponse.json({ ok: false, message: "No recipients" }, { status: 400 });

  const rows = ids.map((user_id, i) => ({
    artist_id: artist.id,
    user_id,
    title,
    message: (b.message ?? "").trim().slice(0, 500),
    code: b.code ? `${b.code.trim().toUpperCase()}${ids.length > 1 ? `-${String(i + 1).padStart(3, "0")}` : ""}` : null,
  }));
  const { error } = await db.from("drops").insert(rows);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  if (b.notify_sms && smsEnabled()) {
    const { data: fans } = await db.from("users").select("id, phone").in("id", ids);
    for (const f of fans ?? []) {
      if (f.phone) void sendSms(f.phone, `${artist.name} sent you a drop: ${title}. Open BandDrop to claim it.`);
    }
  }
  return NextResponse.json({ ok: true, sent: rows.length });
}
