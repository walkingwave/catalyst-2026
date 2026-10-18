import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side helper for fan pages. Redirects to /login when signed out. */
export async function requireFan(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: profile ?? { id: user.id, name: "", phone: user.phone ?? null } };
}

/** Inbox for the current event: that artist's messages plus alerts for its shows. No scope = everything. */
export async function fanMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  scope?: { artistId: string; concertIds: string[] },
) {
  let query = supabase.from("messages")
    .select("id, body, channel, image_url, created_at, artist:artists(name), concert:concerts(name)")
    .eq("user_id", userId).or("channel.eq.inbox,concert_id.is.null");
  if (scope) {
    query = query.or(scope.concertIds.length
      ? `artist_id.eq.${scope.artistId},concert_id.in.(${scope.concertIds.join(",")})`
      : `artist_id.eq.${scope.artistId}`);
  }
  return query.order("created_at", { ascending: false }).limit(5);
}

export type ScanRow = {
  id: string;
  scanned_at: string;
  band_uid: string;
  activity: { name: string; points: number; concert_id: string } | null;
};

/** All scans across every band the fan owns, newest first. */
export async function fanScans(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("scans")
    .select("id, scanned_at, band_uid, activity:activities(name, points, concert_id)")
    .order("scanned_at", { ascending: false });
  return (data ?? []).map((s) => ({
    ...s,
    activity: Array.isArray(s.activity) ? s.activity[0] ?? null : s.activity,
  })) as ScanRow[];
}

export function formatDate(d: string) {
  return new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Published polls for one artist (open first, then latest closed), with results and the fan's own vote. */
export async function fanPolls(supabase: Awaited<ReturnType<typeof createClient>>, artistId: string, limitClosed = 2) {
  const { data: polls } = await supabase
    .from("polls")
    .select("*")
    .eq("artist_id", artistId)
    .in("status", ["open", "closed"])
    .order("created_at", { ascending: false })
    .limit(10);
  const list = polls ?? [];
  const open = list.filter((p) => p.status === "open" && (!p.closes_at || Date.parse(p.closes_at) > Date.now()));
  const closed = list.filter((p) => !open.includes(p)).slice(0, limitClosed);
  const chosen = [...open, ...closed];
  if (chosen.length === 0) return [];
  const ids = chosen.map((p) => p.id);
  const [{ data: results }, { data: mine }] = await Promise.all([
    supabase.from("poll_results").select("*").in("poll_id", ids),
    supabase.from("poll_votes").select("poll_id, option_id").in("poll_id", ids),
  ]);
  const { assemble } = await import("@/lib/polls");
  return assemble(chosen, results ?? [], mine ?? []);
}
