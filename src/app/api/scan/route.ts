import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { normalizeUid, isValidUid } from "@/lib/uid";
import { smsEnabled } from "@/lib/sms";
import { notifyFans } from "@/lib/notifications";
import type { ScanResult } from "@/lib/types";

export const runtime = "nodejs";

function reply(body: ScanResult, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/scan
 * headers: x-staff-pin
 * body: { band_uid: string, activity_id: string }
 *
 * Logs a scan against the band UID. Unknown bands are auto-registered to the
 * activity's concert. Same band + activity twice -> "duplicate" (no points).
 */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) {
    return reply({ ok: false, status: "error", message: "Bad staff PIN" }, 401);
  }

  let body: { band_uid?: string; activity_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, status: "error", message: "Invalid JSON" }, 400);
  }

  const uid = normalizeUid(body.band_uid ?? "");
  const activityId = body.activity_id;
  if (!isValidUid(uid) || !activityId) {
    return reply({ ok: false, status: "error", message: "Missing band or activity" }, 400);
  }

  const db = createAdminClient();

  const { data: activity, error: aErr } = await db
    .from("activities")
    .select("id, name, points, concert_id")
    .eq("id", activityId)
    .eq("kind", "scan")
    .maybeSingle();
  if (aErr || !activity) {
    return reply({ ok: false, status: "error", message: "Unknown activity" }, 404);
  }

  // Find or register the band.
  const { data: existing } = await db
    .from("bands")
    .select("uid, concert_id, user_id, archived")
    .eq("uid", uid)
    .maybeSingle();

  let band = existing;
  if (!band) {
    const { data: created, error: bErr } = await db
      .from("bands")
      .insert({ uid, concert_id: activity.concert_id })
      .select("uid, concert_id, user_id, archived")
      .single();
    if (bErr || !created) {
      return reply({ ok: false, status: "error", message: "Could not register band" }, 500);
    }
    band = created;
  }

  if (band.archived) {
    return reply({ ok: false, status: "error", message: "Band expired", band_uid: uid }, 409);
  }
  if (band.concert_id !== activity.concert_id) {
    return reply(
      { ok: false, status: "error", message: "Band belongs to a different concert", band_uid: uid },
      409,
    );
  }

  const { error: sErr } = await db
    .from("scans")
    .insert({ band_uid: uid, activity_id: activity.id });

  if (sErr) {
    if (sErr.code === "23505") {
      return reply({
        ok: false,
        status: "duplicate",
        message: `Already did ${activity.name}`,
        activity: activity.name,
        points: 0,
        band_uid: uid,
        claimed: !!band.user_id,
      });
    }
    return reply({ ok: false, status: "error", message: "Scan failed" }, 500);
  }

  const result: ScanResult = {
    ok: true,
    status: "scanned",
    message: `+${activity.points} pts`,
    activity: activity.name,
    points: activity.points,
    band_uid: uid,
    claimed: !!band.user_id,
    rank: null,
  };

  if (band.user_id) {
    const [{ data: owner }, { data: lb }, { data: concert }] = await Promise.all([
      db.from("users").select("name, phone").eq("id", band.user_id).maybeSingle(),
      db.from("leaderboard_concert").select("user_id, rank").eq("concert_id", activity.concert_id),
      db.from("concerts").select("artist_id").eq("id", activity.concert_id).maybeSingle(),
    ]);
    const me = lb?.find((r) => r.user_id === band.user_id);
    result.owner_name = owner?.name ?? undefined;
    result.rank = me?.rank ?? null;
    result.total_tonight = lb?.length ?? 0;

    const rankText = me?.rank ? ` You're #${me.rank} tonight.` : "";
    const text = `+${activity.points} pts at ${activity.name}.${rankText}`;
    // Next keeps the task alive after responding, including on Vercel.
    if (concert?.artist_id) {
      after(async () => {
        await notifyFans(db, [{
          artistId: concert.artist_id, userId: band.user_id!, phone: owner?.phone ?? null,
          body: text, sms: smsEnabled(),
        }]);
      });
    }
  }

  return reply(result);
}
