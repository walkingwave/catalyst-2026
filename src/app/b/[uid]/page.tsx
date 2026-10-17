import Image from "next/image";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { normalizeUid, isValidUid } from "@/lib/uid";
import { Page, Panel, LinkButton, Points, List, Row, SectionHeader, Headline, Banner } from "@/components/ui";
import { recordSelfTap, type TapOutcome } from "@/lib/tap";
import { Header } from "@/components/Header";
import { ClaimFlow } from "./ClaimFlow";

export default async function BandPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid: raw } = await params;
  const uid = normalizeUid(raw);

  // Self-tap: if the event has a live station, this page load IS the tap (works from any iPhone).
  const tap: TapOutcome = isValidUid(uid) ? await recordSelfTap(uid) : { kind: "none" };
  const tapQuery = tap.kind === "scanned" ? `?tap=${encodeURIComponent(tap.activity)}&pts=${tap.points}` : tap.kind === "duplicate" ? `?tap=${encodeURIComponent(tap.activity)}&dup=1` : "";

  const db = createAdminClient();
  const { data: band } = isValidUid(uid)
    ? await db
        .from("bands")
        .select("uid, user_id, archived, concert:concerts(name, artist, venue, date, image_url)")
        .eq("uid", uid)
        .maybeSingle()
    : { data: null };

  if (!band) {
    return (
      <Page>
        <Header />
        <Headline sub="This wristband hasn't been scanned at a show yet. Tap in at the entry and try again.">
          Unknown band
        </Headline>
        <LinkButton href="/login" variant="outline">Sign in instead</LinkButton>
      </Page>
    );
  }

  const user = await getUser();
  const concert = Array.isArray(band.concert) ? band.concert[0] : band.concert;

  if (band.user_id && user && band.user_id === user.id) redirect(`/dashboard${tapQuery}`);

  if (band.user_id) {
    return (
      <Page>
        <Header />
        <TapBanner tap={tap} />
        <Headline
          sub={
            user
              ? "It belongs to another fan. Sign in with the number that claimed it."
              : "Sign in with the number that claimed it to see your points."
          }
        >
          Band already claimed
        </Headline>
        <LinkButton href={`/login?next=/b/${uid}`}>Sign in with phone</LinkButton>
      </Page>
    );
  }

  if (band.archived) {
    return (
      <Page>
        <Header />
        <Headline sub="Unclaimed bands expire 30 days after the show.">This band expired</Headline>
      </Page>
    );
  }

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
      <TapBanner tap={tap} />
      {concert && (
        <div className="relative aspect-[16/10] mt-2 border border-line overflow-hidden">
          {concert.image_url && (
            <Image src={concert.image_url} alt={concert.artist} fill className="object-cover photo" priority />
          )}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent text-white">
            <p className="label text-white/70">{concert.venue}</p>
            <p className="display d-lg mt-1">{concert.artist}</p>
          </div>
        </div>
      )}

      <Panel invert className="p-5 mt-3">
        <p className="label text-invert-fg/70">This band has</p>
        <div className="flex items-end gap-3 mt-3">
          <Points value={points} className="display text-[72px] leading-[0.85]" />
          <span className="display d-md pb-1">pts</span>
        </div>
        <p className="t-foot text-invert-fg/70 mt-3">
          {count === 0
            ? "No activities yet. Tap in at a booth to start earning."
            : `${count} ${count === 1 ? "activity" : "activities"} tonight`}
        </p>
      </Panel>

      {scans && scans.length > 0 && (
        <List className="mt-3 border-t-0">
          {scans.map((s, i) => {
            const a = Array.isArray(s.activity) ? s.activity[0] : s.activity;
            return <Row key={i} title={a?.name} value={`+${a?.points}`} />;
          })}
        </List>
      )}

      <SectionHeader>Save your points</SectionHeader>
      <p className="t-sub text-ink-2 mb-4">
        Claim this band so the points stick with you. Name and phone, that&apos;s it.
      </p>
      <ClaimFlow uid={uid} signedIn={!!user} />
    </Page>
  );
}

function TapBanner({ tap }: { tap: TapOutcome }) {
  if (tap.kind === "none") return null;
  return (
    <div className="mt-2">
      {tap.kind === "scanned" ? (
        <Banner>+{tap.points} pts · {tap.activity}</Banner>
      ) : (
        <Banner tone="warning">Already tapped in at {tap.activity}</Banner>
      )}
    </div>
  );
}
