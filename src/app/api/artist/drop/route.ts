import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { smsEnabled } from "@/lib/sms";
import { notifyFans } from "@/lib/notifications";
import { artistRecipients } from "@/lib/artist-recipients";

export const maxDuration = 300;

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
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 80) : "";
  if (!title) return NextResponse.json({ ok: false, message: "Title is empty" }, { status: 400 });
  if (b.notify_sms && !smsEnabled()) {
    return NextResponse.json({ ok: false, message: "SMS is unavailable. Turn off the SMS alert or enable SMS on this deployment." }, { status: 503 });
  }

  const db = createAdminClient();
  let fans;
  try {
    fans = await artistRecipients(db, artist.id, b);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Could not load fans." }, { status: 400 });
  }
  const ids = fans.map((fan) => fan.id);

  const rows = ids.map((user_id, i) => ({
    artist_id: artist.id,
    user_id,
    title,
    message: typeof b.message === "string" ? b.message.trim().slice(0, 500) : "",
    code: typeof b.code === "string" && b.code.trim() ? `${b.code.trim().toUpperCase()}${ids.length > 1 ? `-${String(i + 1).padStart(3, "0")}` : ""}` : null,
  }));
  const { error } = await db.from("drops").insert(rows);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const delivery = b.notify_sms ? await notifyFans(db, fans.map((fan) => ({
    artistId: artist.id, userId: fan.id, phone: fan.phone, sms: true,
    body: `${artist.name} sent you a drop: ${title}. Open BandDrop to claim it.`,
  }))) : null;
  return NextResponse.json({ ok: true, sent: rows.length, delivery });
}
