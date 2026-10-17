import Image from "next/image";
import Link from "next/link";
import { requireFan, formatDate } from "@/lib/fan";
import { attendedArtists } from "@/lib/current";
import { Page, Headline, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconCheck } from "@/components/icons";

/** Master list of every artist/team the fan has tapped into. Tapping one makes it the current event. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { supabase, user } = await requireFan("/events");
  const { next } = await searchParams;
  const { list, current } = await attendedArtists(supabase, user.id);

  return (
    <Page>
      <Header />
      <Headline kicker="Points are kept per event">Events</Headline>
      {list.length === 0 ? (
        <Empty>No events yet. Tap your band at a show.</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((row) => {
            const active = row.artist.id === current?.artist.id;
            const latest = row.shows[0];
            return (
              <Link
                key={row.artist.id}
                href={`/select/${row.artist.id}?next=${encodeURIComponent(next ?? "/dashboard")}`}
                className={`block press ${active ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}
              >
                <div className="flex items-stretch">
                  <div className={`relative w-24 shrink-0 ${active ? "bg-invert-fg/10" : "bg-invert-bg"}`}>
                    {latest?.image_url ? (
                      <Image src={latest.image_url} alt="" fill className="object-cover photo" />
                    ) : (
                      <p className="absolute inset-0 flex items-center justify-center display d-lg text-invert-fg/30 select-none">
                        {row.artist.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="display d-md truncate">{row.artist.name}</p>
                      {active && <IconCheck size={16} strokeWidth={3} />}
                    </div>
                    <p className={`t-foot mt-1 truncate ${active ? "opacity-70" : "text-ink-2"}`}>
                      {row.shows.length} {row.shows.length === 1 ? "show" : "shows"} · last {latest ? formatDate(latest.date) : "—"}
                      {row.rank ? ` · #${row.rank}` : ""}
                    </p>
                  </div>
                  <div className="pr-4 py-3 text-right shrink-0">
                    <p className="display d-lg t-num"><Points value={row.balance} /></p>
                    <p className={`t-foot ${active ? "opacity-70" : "text-ink-2"}`}>pts</p>
                  </div>
                </div>
                {row.shows.length > 0 && (
                  <div className={`px-4 pb-3 flex gap-2 flex-wrap ${active ? "opacity-80" : "text-ink-2"}`}>
                    {row.shows.map((s) => (
                      <span key={s.id} className="t-foot">{s.venue} · {formatDate(s.date)}</span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <Nav />
    </Page>
  );
}
