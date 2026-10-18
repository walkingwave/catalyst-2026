import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, fanMessages, timeAgo, formatDate } from "@/lib/fan";
import { attendedArtists } from "@/lib/current";
import { Page, Panel, Points, List, Row, SectionHeader, Banner, Empty, Ticket, TicketField } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconChevron } from "@/components/icons";
import { DropCard } from "./DropCard";
import { InboxRefresh } from "./InboxRefresh";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ claimed?: string; tap?: string; pts?: string; dup?: string }>;
}) {
  const { supabase, user, profile } = await requireFan("/dashboard");
  const { claimed, tap, pts: tapPts, dup } = await searchParams;

  const [{ list, current }, scans, { data: drops }, { data: messages }, { data: concerts }] = await Promise.all([
    attendedArtists(supabase, user.id),
    fanScans(supabase),
    supabase.from("drops").select("*, artist:artists(name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    fanMessages(supabase, user.id),
    supabase.from("concerts").select("id, artist, venue, date, artist_id"),
  ]);
  const concertBy = new Map((concerts ?? []).map((c) => [c.id, c]));

  const latestShow = current?.shows[0] ?? null;
  let showRank: { rank: number; total: number } | null = null;
  let eventTotal = 0;
  if (current) {
    const [{ data: lc }, { data: la }] = await Promise.all([
      latestShow ? supabase.from("leaderboard_concert").select("user_id, rank").eq("concert_id", latestShow.id) : Promise.resolve({ data: [] as { user_id: string; rank: number }[] }),
      supabase.from("leaderboard_artist").select("user_id").eq("artist_id", current.artist.id),
    ]);
    const me = lc?.find((r) => r.user_id === user.id);
    if (me) showRank = { rank: me.rank, total: lc?.length ?? 0 };
    eventTotal = la?.length ?? 0;
  }

  // Activity scoped to the current event, newest first, each row naming its show.
  const recent = scans
    .filter((s) => !current || concertBy.get(s.activity?.concert_id ?? "")?.artist_id === current.artist.id)
    .slice(0, 6);
  const firstName = (profile.name || "").split(" ")[0];
  const inbox = [
    ...(drops ?? []).map((d) => ({ kind: "drop" as const, at: d.created_at, d })),
    ...(messages ?? []).map((m) => ({ kind: "msg" as const, at: m.created_at, m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);

  return (
    <Page>
      <InboxRefresh />
      <Header
        right={
          <form action="/auth/signout" method="post">
            <button className="label text-ink h-11 px-2">Sign out</button>
          </form>
        }
      />

      {claimed && <div className="mb-3"><Banner>Band claimed.</Banner></div>}
      {tap && (
        <div className="mb-3">
          {dup ? <Banner tone="warning">Already tapped in at {tap}</Banner> : <Banner>+{tapPts} pts · {tap}</Banner>}
        </div>
      )}

      {/* Current event switcher */}
      <Link href="/events?next=/dashboard" className="flex items-center justify-between py-2 press">
        <div className="min-w-0">
          <p className="mono-caps text-[10px] text-ink-2">Current event</p>
          <p className="display d-md truncate">{current ? current.artist.name : "No event yet"}</p>
        </div>
        <span className="label text-ink-2 flex items-center gap-1 shrink-0">
          Switch <IconChevron size={16} />
        </span>
      </Link>

      {/* Points pass for the current event only */}
      <div className="mt-2">
        <Ticket
          invert
          rail="Admit one"
          main={
            <>
              <div className="flex items-start justify-between">
                <p className="mono-caps text-[10px] opacity-70">{firstName || "Your pass"}</p>
                {latestShow && <p className="mono-caps text-[10px] opacity-70">{latestShow.venue} · {formatDate(latestShow.date)}</p>}
              </div>
              <div className="flex items-end gap-3 mt-5">
                <Points value={current?.balance ?? 0} className="display text-[76px] leading-[0.8]" />
                <span className="display d-md pb-1">pts</span>
              </div>
              <p className="mono-caps text-[10px] opacity-70 mt-2">{current ? `with ${current.artist.name}` : "tap a band to start"}</p>
            </>
          }
          stub={
            <div className="grid grid-cols-3 gap-2">
              <TicketField label="Tonight" value={showRank ? `#${showRank.rank}` : "—"} sub={showRank ? `of ${showRank.total}` : ""} />
              <TicketField label="Overall" value={current?.rank ? `#${current.rank}` : "—"} sub={eventTotal ? `of ${eventTotal}` : ""} />
              <TicketField label="Spent" value={((current?.earned ?? 0) - (current?.balance ?? 0)).toLocaleString()} sub="pts" />
            </div>
          }
        />
      </div>

      {inbox.length > 0 && (
        <>
          <SectionHeader>Inbox</SectionHeader>
          <div className="space-y-3">
            {inbox.map((i) =>
              i.kind === "drop" ? (
                <DropCard key={i.d.id} drop={{ ...i.d, artist_name: (Array.isArray(i.d.artist) ? i.d.artist[0] : i.d.artist)?.name ?? "Artist" }} />
              ) : (
                <Panel key={i.m.id} className="p-4">
                  <p className="label text-ink-2">
                    {(Array.isArray(i.m.artist) ? i.m.artist[0] : i.m.artist)?.name ?? (Array.isArray(i.m.concert) ? i.m.concert[0] : i.m.concert)?.name ?? "Event"} · {timeAgo(i.m.created_at)}
                  </p>
                  <p className="t-body mt-2">{i.m.body}</p>
                </Panel>
              ),
            )}
          </div>
        </>
      )}

      {latestShow && (
        <>
          <SectionHeader>Latest show</SectionHeader>
          <Link href={`/concerts/${latestShow.id}`} className="block press -mx-4">
            <div className="relative aspect-[16/10]">
              {latestShow.image_url && <Image src={latestShow.image_url} alt="" fill className="object-cover photo" priority />}
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent text-white flex items-end justify-between">
                <div>
                  <p className="label text-white/70">{latestShow.venue} · {formatDate(latestShow.date)}</p>
                  <p className="display d-lg mt-1">{current?.artist.name}</p>
                </div>
                <IconChevron size={22} className="mb-1" />
              </div>
            </div>
          </Link>
        </>
      )}

      {list.length > 1 && (
        <>
          <SectionHeader action={<Link href="/events">All</Link>}>Events</SectionHeader>
          <div className="hscroll flex gap-3 overflow-x-auto -mx-4 px-4 snap-x">
            {list.map((row) => (
              <Link key={row.artist.id} href={`/select/${row.artist.id}?next=/dashboard`} className="press shrink-0 w-[62%] snap-start">
                <div className={`relative aspect-[4/5] overflow-hidden ${row.artist.id === current?.artist.id ? "ring-2 ring-ink" : ""} bg-invert-bg`}>
                  {row.shows[0]?.image_url ? (
                    <Image src={row.shows[0].image_url} alt="" fill className="object-cover photo" />
                  ) : (
                    <p className="absolute inset-0 flex items-center justify-center display text-[120px] text-invert-fg/15 select-none">
                      {row.artist.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                    </p>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white">
                    <p className="label text-white/70">{row.artist.kind}</p>
                    <p className="display d-md mt-1">{row.artist.name}</p>
                    <p className="display d-lg t-num mt-2">{row.balance.toLocaleString()}<span className="d-sm ml-1">pts</span></p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionHeader>Activity</SectionHeader>
      {recent.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <List>
          {recent.map((s) => {
            const c = concertBy.get(s.activity?.concert_id ?? "");
            return (
              <Row
                key={s.id}
                title={s.activity?.name}
                subtitle={`${c ? `${c.artist} · ${c.venue}` : ""} · ${timeAgo(s.scanned_at)}`}
                value={`+${s.activity?.points}`}
              />
            );
          })}
        </List>
      )}

      <Nav />
    </Page>
  );
}
