import type { SupabaseClient } from "@supabase/supabase-js";

// Every venue so far is in Toronto; doors times are entered as local wall-clock text ("6:30 PM").
const VENUE_TZ = "America/Toronto";

/** UTC offset (ms) of the venue timezone at a given instant. */
function tzOffset(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: VENUE_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at.getTime();
}

/** When pre-event activities lock: doors on the show date, or the start of that day if doors aren't parseable. */
export function preEventClosesAt(concert: { date: string; doors_at?: string | null }): Date {
  const m = concert.doors_at?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = 0, minute = 0;
  if (m) {
    const ampm = m[3]?.toLowerCase();
    hour = Number(m[1]);
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    minute = Number(m[2] ?? 0);
    if (hour > 23 || minute > 59) hour = minute = 0;
  }
  const [y, mo, d] = concert.date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, hour, minute);
  return new Date(wall - tzOffset(new Date(wall)));
}

/** Pre-event activities are open until doors; regular activities are always open. */
export function activityOpen(activity: { pre_event?: boolean | null }, concert: { date: string; doors_at?: string | null }, now = Date.now()) {
  return !activity.pre_event || now < preEventClosesAt(concert).getTime();
}

/** A fan takes part in an event once they hold a band there or redeemed an invite for it. */
export async function enrolledIn(db: SupabaseClient, userId: string, concertId: string) {
  const [{ count: bands }, { count: invites }] = await Promise.all([
    db.from("bands").select("uid", { count: "exact", head: true }).eq("user_id", userId).eq("concert_id", concertId),
    db.from("event_invites").select("code", { count: "exact", head: true }).eq("redeemed_by", userId).eq("concert_id", concertId),
  ]);
  return (bands ?? 0) + (invites ?? 0) > 0;
}
