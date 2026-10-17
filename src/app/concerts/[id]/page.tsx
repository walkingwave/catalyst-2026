import Image from "next/image";
import { notFound } from "next/navigation";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, List, Row, SectionHeader, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { VenueMap } from "@/components/VenueMap";
import { SocialSubmit } from "@/components/SocialSubmit";
import type { Activity, Concert } from "@/lib/types";

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireFan(`/concerts/${id}`);

  const [{ data: concert }, { data: activities }, scans, { data: posts }] = await Promise.all([
    supabase.from("concerts").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*").eq("concert_id", id).order("points"),
    fanScans(supabase),
    supabase.from("social_posts").select("activity_id, status").eq("user_id", user.id),
  ]);
  if (!concert) notFound();
  const c = concert as Concert;
  const acts = (activities ?? []) as Activity[];
  const mine = scans.filter((s) => s.activity?.concert_id === id);
  const doneNames = new Set(mine.map((s) => s.activity?.name));
  const doneIds = new Set(acts.filter((a) => doneNames.has(a.name)).map((a) => a.id));
  const postBy = new Map((posts ?? []).map((p) => [p.activity_id, p.status]));
  for (const [aid, st] of postBy) if (st === "approved") doneIds.add(aid);
  const scanActs = acts.filter((a) => a.kind !== "social");
  const socialActs = acts.filter((a) => a.kind === "social");
  const socialEarned = acts.filter((a) => a.kind === "social" && postBy.get(a.id) === "approved").reduce((n, a) => n + a.points, 0);
  const earned = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0) + socialEarned;
  const possible = acts.reduce((n, a) => n + a.points, 0);

  return (
    <Page>
      <Header />
      <div className="relative aspect-[4/5] mt-2 -mx-4 overflow-hidden">
        {c.image_url && <Image src={c.image_url} alt={c.artist} fill className="object-cover photo" priority />}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent text-white">
          <p className="label text-white/70">{formatDate(c.date)} · {c.venue}</p>
          <h1 className="display d-hero mt-1">{c.artist}</h1>
        </div>
      </div>
      <p className="t-body text-ink-2 mt-4">{c.description}</p>

      <SectionHeader>Details</SectionHeader>
      <List>
        <Row title="Show" value={<span className="t-sub normal-case font-sans font-medium">{c.name}</span>} />
        <Row title="Venue" value={<span className="t-sub normal-case font-sans font-medium">{c.venue}</span>} />
        {c.doors_at && <Row title="Doors" value={<span className="t-sub normal-case font-sans font-medium">{c.doors_at}</span>} />}
        {c.address && <Row title="Address" value={<span className="t-sub normal-case font-sans font-medium">{c.address}</span>} />}
      </List>

      <SectionHeader action={`${earned} / ${possible} pts`}>Venue map</SectionHeader>
      <VenueMap activities={scanActs} done={doneIds} venue={c.venue} imageUrl={c.map_image_url} />

      {c.venue_image_url && (
        <div className="relative aspect-[16/9] mt-3 -mx-4 overflow-hidden">
          <Image src={c.venue_image_url} alt={c.venue} fill className="object-cover photo" />
          <p className="absolute left-3 bottom-3 label text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {c.venue}{c.address ? ` · ${c.address}` : ""}
          </p>
        </div>
      )}

      {socialActs.length > 0 && (
        <>
          <SectionHeader>Social</SectionHeader>
          <div className="rules">
            {socialActs.map((a) => {
              const st = postBy.get(a.id);
              return (
                <div key={a.id}>
                  <Row
                    title={a.name}
                    subtitle={a.location ?? undefined}
                    value={st === "approved" ? "Done" : st === "pending" ? "Pending" : st === "rejected" ? "Rejected" : <>+<Points value={a.points} /></>}
                    valueTone={st === "approved" ? "success" : st ? "muted" : "default"}
                  />
                  {!st && <SocialSubmit activityId={a.id} network={a.social_network ?? null} points={a.points} />}
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionHeader>Activities</SectionHeader>
      <List>
        {scanActs.map((a) => (
          <Row
            key={a.id}
            title={a.name}
            subtitle={a.location ?? undefined}
            value={doneIds.has(a.id) ? "Done" : <>+<Points value={a.points} /></>}
            valueTone={doneIds.has(a.id) ? "success" : "default"}
          />
        ))}
      </List>
      <Nav />
    </Page>
  );
}
