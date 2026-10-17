import Image from "next/image";
import { notFound } from "next/navigation";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, Card, List, Row, SectionHeader, Points } from "@/components/ui";
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
      <Card className="overflow-hidden mt-2">
        {c.image_url && (
          <div className="relative aspect-[4/3]">
            <Image src={c.image_url} alt={c.artist} fill className="object-cover" priority />
          </div>
        )}
        <div className="p-4">
          <h1 className="t-title1">{c.artist}</h1>
          <p className="t-subhead text-text-2 mt-0.5">{c.name}</p>
          {c.description && <p className="t-subhead mt-3">{c.description}</p>}
        </div>
      </Card>

      <SectionHeader>Details</SectionHeader>
      <List>
        <Row title="Venue" value={c.venue} valueTone="muted" />
        <Row title="Date" value={formatDate(c.date)} valueTone="muted" />
        {c.doors_at && <Row title="Doors" value={c.doors_at} valueTone="muted" />}
        {c.address && <Row title="Address" value={c.address} valueTone="muted" />}
      </List>

      <SectionHeader action={<span>{earned} / {possible} pts</span>}>Venue map</SectionHeader>
      <VenueMap activities={acts} done={doneIds} venue={c.venue} />

      {c.venue_image_url && (
        <Card className="overflow-hidden mt-3">
          <div className="relative aspect-[16/9]">
            <Image src={c.venue_image_url} alt={c.venue} fill className="object-cover" />
          </div>
          <p className="t-footnote text-text-2 px-4 py-2">{c.venue}{c.address ? ` · ${c.address}` : ""}</p>
        </Card>
      )}

      <SectionHeader>Activities</SectionHeader>
      <List>
        {acts.map((a) => (
          <Row
            key={a.id}
            title={a.name}
            subtitle={a.location ?? undefined}
            value={doneIds.has(a.id) ? "Done" : <Points value={a.points} />}
            valueTone={doneIds.has(a.id) ? "success" : "accent"}
          />
        ))}
      </List>
      <Nav />
    </Page>
  );
}
