import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, Card, LargeTitle, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconChevron } from "@/components/icons";
import type { Concert } from "@/lib/types";

export default async function ConcertsPage() {
  const { supabase, user } = await requireFan("/concerts");

  const [{ data: bands }, scans] = await Promise.all([
    supabase
      .from("bands")
      .select("uid, concert:concerts(id, name, artist, venue, date, image_url)")
      .eq("user_id", user.id),
    fanScans(supabase),
  ]);

  const byId = new Map<string, Concert>();
  for (const b of bands ?? []) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as Concert | null;
    if (c) byId.set(c.id, c);
  }
  const concerts = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Page>
      <Header />
      <LargeTitle sub="Every show you've tapped in at.">Shows</LargeTitle>
      {concerts.length === 0 ? (
        <Card>
          <Empty>No shows yet. Claim a band to start your history.</Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          {concerts.map((c) => {
            const mine = scans.filter((s) => s.activity?.concert_id === c.id);
            const total = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0);
            return (
              <Link key={c.id} href={`/concerts/${c.id}`} className="block active:opacity-70">
                <Card className="overflow-hidden">
                  <div className="flex items-center">
                    <div className="relative w-24 h-24 shrink-0 bg-surface-2">
                      {c.image_url && <Image src={c.image_url} alt={c.artist} fill className="object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0 px-4 py-3">
                      <p className="t-headline truncate">{c.artist}</p>
                      <p className="t-footnote text-text-2 truncate">
                        {c.venue} · {formatDate(c.date)}
                      </p>
                      <p className="t-footnote text-text-2 mt-1">
                        {mine.length} {mine.length === 1 ? "activity" : "activities"} ·{" "}
                        <Points value={total} className="text-success font-medium" /> pts
                      </p>
                    </div>
                    <IconChevron size={18} className="text-text-3 mr-3" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <Nav />
    </Page>
  );
}
