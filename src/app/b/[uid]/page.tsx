import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { normalizeUid, isValidUid } from "@/lib/uid";
import { Page, Card, LinkButton, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { ClaimFlow } from "./ClaimFlow";

export default async function BandPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid: raw } = await params;
  const uid = normalizeUid(raw);

  const db = createAdminClient();
  const { data: band } = isValidUid(uid)
    ? await db
        .from("bands")
        .select("uid, user_id, archived, concert:concerts(name, artist, venue, date)")
        .eq("uid", uid)
        .maybeSingle()
    : { data: null };

  if (!band) {
    return (
      <Page className="flex flex-col justify-center min-h-dvh pb-6">
        <Header />
        <h1 className="text-3xl font-bold">Hmm, unknown band.</h1>
        <p className="text-muted mt-2">
          This wristband hasn&apos;t been scanned at a show yet. Tap in at the entry and try again.
        </p>
        <div className="mt-8">
          <LinkButton href="/login" variant="secondary">
            Sign in instead
          </LinkButton>
        </div>
      </Page>
    );
  }

  const user = await getUser();
  const concert = Array.isArray(band.concert) ? band.concert[0] : band.concert;

  // Claimed by me -> straight to dashboard.
  if (band.user_id && user && band.user_id === user.id) redirect("/dashboard");

  // Claimed by someone else (or not logged in) -> login prompt.
  if (band.user_id) {
    return (
      <Page>
        <Header />
        <h1 className="text-3xl font-bold">This band is claimed.</h1>
        <p className="text-muted mt-2">
          {user
            ? "It belongs to another fan. Sign in with the number that claimed it."
            : "Sign in with the number that claimed it to see your points."}
        </p>
        <div className="mt-8">
          <LinkButton href={`/login?next=/b/${uid}`}>Sign in with phone</LinkButton>
        </div>
      </Page>
    );
  }

  if (band.archived) {
    return (
      <Page className="flex flex-col justify-center min-h-dvh pb-6">
        <Header />
        <h1 className="text-3xl font-bold">This band expired.</h1>
        <p className="text-muted mt-2">Unclaimed bands expire 30 days after the show.</p>
      </Page>
    );
  }

  // Unclaimed: preview + claim.
  const { data: stats } = await db
    .from("band_points")
    .select("points, activity_count")
    .eq("band_uid", uid)
    .maybeSingle();
  const { data: scans } = await db
    .from("scans")
    .select("scanned_at, activity:activities(name, points)")
    .eq("band_uid", uid)
    .order("scanned_at", { ascending: false });

  const points = stats?.points ?? 0;
  const count = stats?.activity_count ?? 0;

  return (
    <Page>
      <Header />
      {concert && (
        <p className="text-muted text-sm">
          {concert.artist} · {concert.venue}
        </p>
      )}
      <h1 className="text-3xl font-bold mt-1">
        You&apos;ve got <Points value={points} className="text-accent" /> pts
      </h1>
      <p className="text-muted mt-1">
        {count === 0
          ? "No activities yet. Tap in at a booth to start earning."
          : `${count} ${count === 1 ? "activity" : "activities"} tonight.`}
      </p>

      {scans && scans.length > 0 && (
        <Card className="mt-5 divide-y divide-border p-0">
          {scans.map((s, i) => {
            const a = Array.isArray(s.activity) ? s.activity[0] : s.activity;
            return (
              <div key={i} className="flex justify-between px-4 py-3">
                <span>{a?.name}</span>
                <span className="text-accent font-mono">+{a?.points}</span>
              </div>
            );
          })}
        </Card>
      )}

      <h2 className="text-xl font-semibold mt-8 mb-1">Save your points</h2>
      <p className="text-muted text-sm mb-4">
        Claim this band so your points stick with you. Name and phone, that&apos;s it.
      </p>
      <ClaimFlow uid={uid} signedIn={!!user} />
    </Page>
  );
}
