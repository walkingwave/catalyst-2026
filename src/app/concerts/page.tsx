import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, Panel, Headline, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconChevron } from "@/components/icons";
import type { Concert } from "@/lib/types";

export default async function ConcertsPage() {
  const { supabase, user } = await requireFan("/concerts");

  const [{ data: bandRows }, { data: invites }, scans] = await Promise.all([
    supabase
      .from("bands")
      .select("uid, concert:concerts(id, name, artist, venue, date, image_url)")
      .eq("user_id", user.id),
    supabase.from("event_invites").select("concert:concerts(id, name, artist, venue, date, image_url)").eq("redeemed_by", user.id),
    fanScans(supabase),
  ]);
  const bands = [...(bandRows ?? []), ...(invites ?? [])];

  const byId = new Map<string, Concert>();
  for (const b of bands) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as Concert | null;
    if (c) byId.set(c.id, c);
  }
  const concerts = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Page>
      <Header />
      <Headline>Shows</Headline>
      {concerts.length === 0 ? (
        <Panel>
          <Empty>No shows yet.</Empty>
        </Panel>
      ) : (
        <div className="space-y-3">
          {concerts.map((c) => {
            const mine = scans.filter((s) => s.activity?.concert_id === c.id);
            const total = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0);
            return (
              <Link key={c.id} href={`/concerts/${c.id}`} className="block active:opacity-70">
                <Panel className="overflow-hidden">
                  <div className="flex items-stretch">
                    <div className="relative w-28 shrink-0 bg-invert-bg">
                      {c.image_url ? (
                        <Image src={c.image_url} alt={c.artist} fill className="object-cover photo" />
                      ) : (
                        <p className="absolute inset-0 flex items-center justify-center display d-xl text-invert-fg/20 select-none">
                          {c.artist.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 px-4 py-3">
                      <p className="display d-md truncate">{c.name}</p>
                      <p className="t-foot text-ink-2 truncate mt-1">
                        {c.artist} · {c.venue} · {formatDate(c.date)}
                      </p>
                      <p className="t-foot text-ink-2 mt-2">
                        {mine.length} {mine.length === 1 ? "activity" : "activities"} ·{" "}
                        <Points value={total} className="text-ink font-semibold" /> pts
                      </p>
                    </div>
                    <IconChevron size={18} className="text-ink-3 self-center mr-3" />
                  </div>
                </Panel>
              </Link>
            );
          })}
        </div>
      )}
      <Nav />
    </Page>
  );
}
