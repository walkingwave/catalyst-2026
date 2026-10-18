import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { isUuid, parseEventNotification, runEventNotifications } from "@/lib/event-notifications";
import { smsEnabled } from "@/lib/sms";

export const maxDuration = 120;
const denied = () => NextResponse.json({ ok: false }, { status: 401 });
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const eventId = new URL(req.url).searchParams.get("concert_id");
  if (!isUuid(eventId)) return fail("Select an event.");
  const db = createAdminClient();
  const [event, history, audience] = await Promise.all([
    db.from("concerts").select("id, name").eq("id", eventId).maybeSingle(),
    db.from("event_notification_history").select("*").eq("concert_id", eventId).order("created_at", { ascending: false }).limit(50),
    db.rpc("event_notification_audience", { p_concert_id: eventId }),
  ]);
  if (event.error || history.error || audience.error) return fail("Event alerts are not ready. Ask the administrator to finish alert setup.", 503);
  if (!event.data) return fail("Event not found.", 404);
  // No cron: resume any alert a previous request could not finish.
  const unfinished = (history.data ?? []).filter((n) => n.status === "scheduled" || n.status === "processing");
  if (unfinished.length) {
    after(async () => {
      for (const n of unfinished) await runEventNotifications(db, n.id, 60000).catch(() => {});
    });
  }
  return NextResponse.json({
    ok: true, event: event.data, notifications: history.data,
    audience: audience.data?.[0] ?? { fans: 0, phones: 0 }, sms_enabled: smsEnabled(),
  });
}

export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  let input;
  try {
    input = parseEventNotification(await req.json());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid alert.");
  }
  const db = createAdminClient();
  const matches = (row: typeof input) => row.concert_id === input.concert_id && row.body === input.body && row.channel === input.channel;
  const previous = await db.from("event_notifications").select("*").eq("id", input.id).maybeSingle();
  if (previous.error) return fail("Could not load alerts. Check alert setup.", 503);
  if (previous.data && !matches(previous.data)) return fail("This request was already used for another alert.", 409);
  if (!previous.data) {
    if (input.channel === "sms" && !smsEnabled()) return fail("SMS is unavailable. Choose Inbox.", 503);
    const { data: event, error: eventError } = await db.from("concerts").select("id").eq("id", input.concert_id).maybeSingle();
    if (eventError) return fail("Could not load event.", 503);
    if (!event) return fail("Event not found.", 404);
    // Repeating a request with the same ID reuses the existing alert instead of sending twice.
    const { error } = await db.from("event_notifications").upsert(input, { onConflict: "id", ignoreDuplicates: true });
    if (error) return fail("Could not save alert. Check alert setup.", 503);
  }
  try {
    await runEventNotifications(db, input.id);
  } catch {
    return fail("Sending paused. Reopen Alerts to resume; fans who already received it will not get a duplicate.", 503);
  }
  const { data: notification } = await db.from("event_notification_history").select("*").eq("id", input.id).maybeSingle();
  return NextResponse.json({ ok: true, notification }, { status: previous.data ? 200 : 201 });
}
