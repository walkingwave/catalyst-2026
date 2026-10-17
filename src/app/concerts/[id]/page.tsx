import Image from "next/image";
import { notFound } from "next/navigation";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, List, Row, SectionHeader, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { VenueMap } from "@/components/VenueMap";
import type { Activity, Concert } from "@/lib/types";

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireFan(`/concerts/${id}`);

  const [{ data: concert }, { data: activities }, scans] = await Promise.all([
    supabase.from("concerts").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*").eq("concert_id", id).order("points"),
    fanScans(supabase),
  ]);
  if (!concert) notFound();
  const c = concert as Concert;
  const acts = (activities ?? []) as Activity[];
  const mine = scans.filter((s) => s.activity?.concert_id === id);
  const doneNames = new Set(mine.map((s) => s.activity?.name));
  const doneIds = new Set(acts.filter((a) => doneNames.has(a.name)).map((a) => a.id));
  const earned = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0);
  const possible = acts.reduce((n, a) => n + a.points, 0);

  return (
    <Page>
      <Header />
      <div className="relative aspect-[4/5] mt-2 border border-line overflow-hidden">
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
      <VenueMap activities={acts} done={doneIds} venue={c.venue} />

      {c.venue_image_url && (
        <div className="relative aspect-[16/9] mt-3 border border-line overflow-hidden">
          <Image src={c.venue_image_url} alt={c.venue} fill className="object-cover photo" />
          <p className="absolute left-3 bottom-3 label text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {c.venue}{c.address ? ` · ${c.address}` : ""}
          </p>
        </div>
      )}

      <SectionHeader>Activities</SectionHeader>
      <List>
        {acts.map((a) => (
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
