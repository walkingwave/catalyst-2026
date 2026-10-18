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
  const [event, history, audience, worker] = await Promise.all([
    db.from("concerts").select("id, name").eq("id", eventId).maybeSingle(),
    db.from("event_notification_history").select("*").eq("concert_id", eventId).order("created_at", { ascending: false }).limit(50),
    db.rpc("event_notification_audience", { p_concert_id: eventId }),
    db.from("notification_worker").select("last_seen_at").eq("id", true).maybeSingle(),
  ]);
  if (event.error || history.error || audience.error || worker.error) return fail("Event notifications are not ready. Ask the administrator to finish notification setup.", 503);
  if (!event.data) return fail("Event not found.", 404);
  return NextResponse.json({
    ok: true, event: event.data, notifications: history.data,
    audience: audience.data?.[0] ?? { fans: 0, phones: 0 }, sms_enabled: smsEnabled(),
    scheduler_active: !!worker.data && Date.parse(worker.data.last_seen_at) > Date.now() - 180000,
  });
}

export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  let input;
  try {
    // A retry of an already-saved schedule remains valid even after its due time.
    input = parseEventNotification(await req.json(), Date.now(), true);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid notification.");
  }
  const db = createAdminClient();
  const previous = await db.from("event_notifications").select("*").eq("id", input.id).maybeSingle();
  if (previous.error) return fail("Could not load notification queue. Check notification setup.", 503);
  const matches = (row: typeof input) => row.concert_id === input.concert_id && row.body === input.body && row.channel === input.channel &&
    (row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null) === input.scheduled_at;
  if (previous.data) {
    return matches(previous.data) ? NextResponse.json({ ok: true, notification: previous.data })
      : fail("This request was already used for another notification.", 409);
  }
  if (input.scheduled_at && Date.parse(input.scheduled_at) <= Date.now()) return fail("Choose a future date and time.");
  if (input.channel === "sms" && !smsEnabled()) return fail("SMS is unavailable. Choose Inbox.", 503);
  const { data: event, error: eventError } = await db.from("concerts").select("id").eq("id", input.concert_id).maybeSingle();
  if (eventError) return fail("Could not load event.", 503);
  if (!event) return fail("Event not found.", 404);
  // Repeating a request with the same ID returns the existing notification.
  const { data, error } = await db.from("event_notifications").upsert(input, { onConflict: "id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) return fail("Could not save notification. Check notification setup.", 503);
  let notification = data;
  if (!notification) {
    const existing = await db.from("event_notifications").select("*").eq("id", input.id).single();
    notification = existing.data;
    if (existing.error || !notification) return fail("Could not confirm notification. Try again without changing the message.", 503);
    if (!matches(notification)) {
      return fail("This request was already used for another notification.", 409);
    }
  }
  if (!notification.scheduled_at && notification.status === "scheduled") {
    after(async () => {
      try { await runEventNotifications(db, notification.id); }
      catch { console.error("[event-notifications] Immediate delivery paused; the recurring worker will continue it."); }
    });
  }
  return NextResponse.json({ ok: true, notification }, { status: data ? 201 : 200 });
}

export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return denied();
  const params = new URL(req.url).searchParams;
  const id = params.get("id"), eventId = params.get("concert_id");
  if (!isUuid(id) || !isUuid(eventId)) return fail("Select a notification.");
  const { data, error } = await createAdminClient().from("event_notifications")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id).eq("concert_id", eventId).eq("status", "scheduled").select("id").maybeSingle();
  if (error) return fail("Could not cancel notification.", 503);
  if (!data) return fail("This notification has already started or was cancelled.", 409);
  return NextResponse.json({ ok: true });
}
