import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { smsEnabled } from "@/lib/sms";
import { notifyFans } from "@/lib/notifications";
import { artistRecipients } from "@/lib/artist-recipients";

export const maxDuration = 300;

/**
 * POST { body, user_ids?: string[], top?: number, channel: "sms" | "inbox" }
 * Sends to explicit fans, or to the top N on this artist's leaderboard.
 * SMS is sent through the configured provider; inbox copies survive SMS failures.
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
  const text = typeof body === "string" ? body.trim().slice(0, 320) : "";
  if (!text) return NextResponse.json({ ok: false, message: "Message is empty" }, { status: 400 });
  if (channel !== "sms" && channel !== "inbox") {
    return NextResponse.json({ ok: false, message: "Invalid channel" }, { status: 400 });
  }
  if (channel === "sms" && !smsEnabled()) {
    return NextResponse.json({ ok: false, message: "SMS is unavailable. Choose Inbox only or enable SMS on this deployment." }, { status: 503 });
  }

  const db = createAdminClient();
  let fans;
  try {
    fans = await artistRecipients(db, artist.id, { user_ids, top });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Could not load fans." }, { status: 400 });
  }
  const delivery = await notifyFans(db, fans.map((fan) => ({
    artistId: artist.id, userId: fan.id, phone: fan.phone, body: text,
    smsBody: `${artist.name}: ${text}`, sms: channel === "sms",
  })));
  return NextResponse.json({ ok: true, sent: delivery.inbox, live: channel === "sms", delivery });
}
