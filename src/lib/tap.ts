import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms, smsEnabled } from "@/lib/sms";

export type TapOutcome =
  | { kind: "scanned"; activity: string; points: number }
  | { kind: "duplicate"; activity: string }
  | { kind: "none" };

/**
 * Self-tap: a band URL was opened (typically an iPhone reading the tag).
 * If the band's event has a live station, log a scan for it. Unknown bands are
 * registered to the event that currently has a live station (demo convenience).
 */
export async function recordSelfTap(uid: string): Promise<TapOutcome> {
  const db = createAdminClient();

  let { data: band } = await db.from("bands").select("uid, concert_id, user_id, archived").eq("uid", uid).maybeSingle();

  if (!band) {
    // Register to the most recent event that has a live station on.
    const { data: live } = await db
      .from("concerts")
      .select("id")
      .not("live_activity_id", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!live) return { kind: "none" };
    const { data: created } = await db
      .from("bands")
      .insert({ uid, concert_id: live.id })
      .select("uid, concert_id, user_id, archived")
      .single();
    band = created;
    if (!band) return { kind: "none" };
  }
  if (band.archived) return { kind: "none" };

  const { data: concert } = await db
    .from("concerts")
    .select("live_activity_id, activity:activities!concerts_live_activity_id_fkey(id, name, points, concert_id)")
    .eq("id", band.concert_id)
    .maybeSingle();
  const act = concert && (Array.isArray(concert.activity) ? concert.activity[0] : concert.activity);
  if (!act || act.concert_id !== band.concert_id) return { kind: "none" };

  const { error } = await db.from("scans").insert({ band_uid: uid, activity_id: act.id });
  if (error) {
    if (error.code === "23505") return { kind: "duplicate", activity: act.name };
    return { kind: "none" };
  }

  if (band.user_id) {
    const [{ data: owner }, { data: c }] = await Promise.all([
      db.from("users").select("phone").eq("id", band.user_id).maybeSingle(),
      db.from("concerts").select("artist_id").eq("id", band.concert_id).maybeSingle(),
    ]);
    const text = `+${act.points} pts at ${act.name}.`;
    if (c?.artist_id) void db.from("messages").insert({ artist_id: c.artist_id, user_id: band.user_id, channel: "inbox", body: text });
    if (owner?.phone && smsEnabled()) void sendSms(owner.phone, text);
  }
  return { kind: "scanned", activity: act.name, points: act.points };
}
