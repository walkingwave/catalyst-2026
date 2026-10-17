import Image from "next/image";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { normalizeUid, isValidUid } from "@/lib/uid";
import { Page, Card, LinkButton, Points, List, Row, SectionHeader, LargeTitle } from "@/components/ui";
import { Header } from "@/components/Header";
import { ClaimFlow } from "./ClaimFlow";

export default async function BandPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid: raw } = await params;
  const uid = normalizeUid(raw);

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
        <LargeTitle sub="This wristband hasn't been scanned at a show yet. Tap in at the entry and try again.">
          Unknown band
        </LargeTitle>
        <LinkButton href="/login" variant="tinted">Sign in instead</LinkButton>
      </Page>
    );
  }

  const user = await getUser();
  const concert = Array.isArray(band.concert) ? band.concert[0] : band.concert;

  if (band.user_id && user && band.user_id === user.id) redirect("/dashboard");

  if (band.user_id) {
    return (
      <Page>
        <Header />
        <LargeTitle
          sub={
            user
              ? "It belongs to another fan. Sign in with the number that claimed it."
              : "Sign in with the number that claimed it to see your points."
          }
        >
          This band is claimed
        </LargeTitle>
        <LinkButton href={`/login?next=/b/${uid}`}>Sign in with phone</LinkButton>
      </Page>
    );
  }

  if (band.archived) {
    return (
      <Page>
        <Header />
        <LargeTitle sub="Unclaimed bands expire 30 days after the show.">This band expired</LargeTitle>
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
      {concert && (
        <Card className="overflow-hidden mt-2">
          {concert.image_url && (
            <div className="relative aspect-[16/9]">
              <Image src={concert.image_url} alt={concert.artist} fill className="object-cover" priority />
            </div>
          )}
          <div className="px-4 py-3">
            <p className="t-headline">{concert.artist}</p>
            <p className="t-footnote text-text-2">{concert.venue}</p>
          </div>
        </Card>
      )}

      <div className="pt-5 pb-1">
        <p className="t-subhead text-text-2">Your band tonight</p>
        <div className="flex items-baseline gap-2">
          <Points value={points} className="t-large-title text-[44px] leading-[52px]" />
          <span className="t-headline text-text-2">points</span>
        </div>
        <p className="t-footnote text-text-2">
          {count === 0
            ? "No activities yet. Tap in at a booth to start earning."
            : `${count} ${count === 1 ? "activity" : "activities"} so far`}
        </p>
      </div>

      {scans && scans.length > 0 && (
        <List className="mt-3">
          {scans.map((s, i) => {
            const a = Array.isArray(s.activity) ? s.activity[0] : s.activity;
            return <Row key={i} title={a?.name} value={`+${a?.points}`} valueTone="success" />;
          })}
        </List>
      )}

      <SectionHeader>Save your points</SectionHeader>
      <Card className="p-4">
        <p className="t-subhead text-text-2 mb-4">
          Claim this band so your points stick with you. Name and phone, that&apos;s it.
        </p>
        <ClaimFlow uid={uid} signedIn={!!user} />
      </Card>
    </Page>
  );
}
