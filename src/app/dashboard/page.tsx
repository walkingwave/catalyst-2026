import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, timeAgo, formatDate } from "@/lib/fan";
import { Page, Panel, Points, List, Row, SectionHeader, Banner, Empty } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconChevron } from "@/components/icons";
import { DropCard } from "./DropCard";
import type { Artist, Concert } from "@/lib/types";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ claimed?: string; tap?: string; pts?: string; dup?: string }>;
}) {
  const { supabase, user, profile } = await requireFan("/dashboard");
  const { claimed, tap, pts: tapPts, dup } = await searchParams;

  const [{ data: pts }, { data: pools }, { data: artists }, { data: bands }, scans, { data: drops }, { data: messages }] =
    await Promise.all([
      supabase.from("user_points").select("earned, spent, balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_artist_points").select("artist_id, earned, spent, balance").eq("user_id", user.id),
      supabase.from("artists").select("id, slug, name, kind, image_url"),
      supabase
        .from("bands")
        .select("uid, concert:concerts(id, name, artist, artist_id, venue, date, image_url)")
        .eq("user_id", user.id),
      fanScans(supabase),
      supabase.from("drops").select("*, artist:artists(name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("messages").select("id, body, channel, created_at, artist:artists(name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

  const byId = new Map<string, Concert>();
  for (const b of bands ?? []) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as Concert | null;
    if (c) byId.set(c.id, c);
  }
  const concerts = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const tonight = concerts[0];

  let artistRank: { rank: number; total: number } | null = null;
  let showRank: { rank: number; total: number } | null = null;
  if (tonight) {
    const [{ data: la }, { data: lc }] = await Promise.all([
      tonight.artist_id
        ? supabase.from("leaderboard_artist").select("user_id, rank").eq("artist_id", tonight.artist_id)
        : Promise.resolve({ data: [] as { user_id: string; rank: number }[] }),
      supabase.from("leaderboard_concert").select("user_id, rank").eq("concert_id", tonight.id),
    ]);
    const a = la?.find((r) => r.user_id === user.id);
    const c = lc?.find((r) => r.user_id === user.id);
    if (a) artistRank = { rank: a.rank, total: la?.length ?? 0 };
    if (c) showRank = { rank: c.rank, total: lc?.length ?? 0 };
  }

  const artistBy = new Map(((artists ?? []) as Artist[]).map((a) => [a.id, a]));
  const fandoms = (pools ?? [])
    .map((p) => ({ ...p, artist: artistBy.get(p.artist_id) ?? null }))
    .filter((p) => p.artist)
    .sort((a, b) => b.balance - a.balance);
  const recent = scans.slice(0, 5);
  const firstName = (profile.name || "there").split(" ")[0];
  const inbox = [
    ...(drops ?? []).map((d) => ({ kind: "drop" as const, at: d.created_at, d })),
    ...(messages ?? []).map((m) => ({ kind: "msg" as const, at: m.created_at, m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);

  return (
    <Page>
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

      {/* Points pass */}
      <Panel invert className="mt-2">
        <div className="p-5">
          <div className="flex items-start justify-between">
            <p className="label text-invert-fg/70">{firstName}</p>
            {tonight && <p className="label text-invert-fg/70">{formatDate(tonight.date)}</p>}
          </div>
          <div className="flex items-end gap-3 mt-6">
            <Points value={pts?.balance ?? 0} className="display text-[80px] leading-[0.8]" />
            <span className="display d-md pb-1">pts</span>
          </div>
        </div>
        <div className="perf mx-5" />
        <div className="grid grid-cols-3 px-5 py-4">
          <Stat label="Show" value={showRank ? `#${showRank.rank}` : "—"} sub={showRank ? `of ${showRank.total}` : ""} />
          <Stat label="Fandom" value={artistRank ? `#${artistRank.rank}` : "—"} sub={artistRank ? `of ${artistRank.total}` : ""} />
          <Stat label="Redeemed" value={(pts?.spent ?? 0).toLocaleString()} sub="pts" />
        </div>
      </Panel>

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
                    {(Array.isArray(i.m.artist) ? i.m.artist[0] : i.m.artist)?.name ?? "Artist"} · {timeAgo(i.m.created_at)}
                  </p>
                  <p className="t-body mt-2">{i.m.body}</p>
                </Panel>
              ),
            )}
          </div>
        </>
      )}

      <SectionHeader action={<Link href="/leaderboard">Ranks</Link>}>Fandoms</SectionHeader>
      {fandoms.length === 0 ? (
        <Empty>No fandoms yet.</Empty>
      ) : (
        <div className="hscroll flex gap-3 overflow-x-auto -mx-4 px-4 snap-x">
          {fandoms.map((f) => (
            <Link key={f.artist_id} href={`/leaderboard?artist=${f.artist_id}`} className="press shrink-0 w-[62%] snap-start">
              <div className="relative aspect-[4/5] bg-invert-bg overflow-hidden">
                {f.artist!.image_url ? (
                  <Image src={f.artist!.image_url} alt="" fill className="object-cover photo" />
                ) : (
                  <p className="absolute inset-0 flex items-center justify-center display text-[120px] text-invert-fg/15 select-none">
                    {f.artist!.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                  </p>
                )}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-white">
                  <p className="label text-white/70">{f.artist!.kind}</p>
                  <p className="display d-md mt-1">{f.artist!.name}</p>
                  <p className="display d-lg t-num mt-2">{f.balance.toLocaleString()}<span className="d-sm ml-1">pts</span></p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tonight && (
        <>
          <SectionHeader>Latest show</SectionHeader>
          <Link href={`/concerts/${tonight.id}`} className="block press -mx-4">
            <div className="relative aspect-[16/10]">
              {tonight.image_url && <Image src={tonight.image_url} alt={tonight.artist} fill className="object-cover photo" priority />}
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent text-white flex items-end justify-between">
                <div>
                  <p className="label text-white/70">{tonight.venue}</p>
                  <p className="display d-lg mt-1">{tonight.artist}</p>
                </div>
                <IconChevron size={22} className="mb-1" />
              </div>
            </div>
          </Link>
        </>
      )}

      <SectionHeader action={<Link href="/concerts">All</Link>}>Activity</SectionHeader>
      {recent.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <List>
          {recent.map((s) => (
            <Row key={s.id} title={s.activity?.name} subtitle={timeAgo(s.scanned_at)} value={`+${s.activity?.points}`} />
          ))}
        </List>
      )}

      <Nav />
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="label text-invert-fg/70">{label}</p>
      <p className="display d-lg t-num mt-1">{value}</p>
      <p className="t-foot text-invert-fg/70">{sub}</p>
    </div>
  );
}
