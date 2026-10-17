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
      // Views have no FK metadata, so no embed here; join artists in code.
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

  // Rank with tonight's artist (the fandom pool), plus rank at the show itself.
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
            <button className="label text-ink h-11 px-2 underline underline-offset-4">Sign out</button>
          </form>
        }
      />

      {claimed && (
        <div className="mb-3">
          <Banner>Band claimed. Your points are saved to this number.</Banner>
        </div>
      )}
      {tap && (
        <div className="mb-3">
          {dup ? <Banner tone="warning">Already tapped in at {tap}</Banner> : <Banner>+{tapPts} pts · {tap}</Banner>}
        </div>
      )}

      <Panel invert className="p-5 mt-2">
        <p className="label text-invert-fg/70">Hey {firstName}, you have</p>
        <div className="flex items-end gap-3 mt-3">
          <Points value={pts?.balance ?? 0} className="display text-[72px] leading-[0.85]" />
          <span className="display d-md pb-1">pts</span>
        </div>
        <p className="t-foot text-invert-fg/70 mt-3">
          across {fandoms.length} {fandoms.length === 1 ? "fandom" : "fandoms"}
          {pts && pts.spent > 0 ? ` · ${pts.spent.toLocaleString()} redeemed` : ""}
        </p>
      </Panel>

      {inbox.length > 0 && (
        <>
          <SectionHeader>From your artists</SectionHeader>
          <div className="space-y-3">
            {inbox.map((i) =>
              i.kind === "drop" ? (
                <DropCard
                  key={i.d.id}
                  drop={{ ...i.d, artist_name: (Array.isArray(i.d.artist) ? i.d.artist[0] : i.d.artist)?.name ?? "Artist" }}
                />
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

      <SectionHeader action={<Link href="/leaderboard">Ranks</Link>}>Your fandoms</SectionHeader>
      {fandoms.length === 0 ? (
        <Panel><Empty>Tap in at a show to start a fandom.</Empty></Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {fandoms.map((f) => (
            <Link key={f.artist_id} href={`/leaderboard?artist=${f.artist_id}`} className="block active:opacity-70">
              <Panel className="overflow-hidden h-full">
                <div className="relative aspect-[16/9] bg-surface-2 border-b border-line">
                  {f.artist!.image_url && <Image src={f.artist!.image_url} alt="" fill className="object-cover photo" />}
                  <span className="absolute left-2 top-2 label bg-invert-bg text-invert-fg px-1.5 py-1">{f.artist!.kind}</span>
                </div>
                <div className="p-3">
                  <p className="display d-sm truncate">{f.artist!.name}</p>
                  <p className="display d-lg t-num mt-2">{f.balance.toLocaleString()}</p>
                  <p className="t-foot text-ink-2">pts to spend</p>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}

      {tonight && (
        <>
          <SectionHeader action={formatDate(tonight.date)}>Latest show</SectionHeader>
          <Link href={`/concerts/${tonight.id}`} className="block active:opacity-70">
            <Panel className="overflow-hidden">
              {tonight.image_url && (
                <div className="relative aspect-[16/10] border-b border-line">
                  <Image src={tonight.image_url} alt={tonight.artist} fill className="object-cover photo" priority />
                  <p className="absolute left-3 bottom-3 display d-lg text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                    {tonight.artist}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 rules-x border-b border-line">
                <div className="px-4 py-3 border-r border-line">
                  <p className="label text-ink-2">At the show</p>
                  <p className="display d-md t-num mt-1">{showRank ? `#${showRank.rank}` : "—"}<span className="t-foot text-ink-2 ml-1 normal-case font-sans">of {showRank?.total ?? 0}</span></p>
                </div>
                <div className="px-4 py-3">
                  <p className="label text-ink-2">In the fandom</p>
                  <p className="display d-md t-num mt-1">{artistRank ? `#${artistRank.rank}` : "—"}<span className="t-foot text-ink-2 ml-1 normal-case font-sans">of {artistRank?.total ?? 0}</span></p>
                </div>
              </div>
              <div className="flex items-center px-4 py-3">
                <p className="t-sub flex-1 truncate">{tonight.venue}</p>
                <span className="label mr-1">Venue map</span>
                <IconChevron size={18} className="text-ink-3" />
              </div>
            </Panel>
          </Link>
        </>
      )}

      <SectionHeader action={<Link href="/concerts">See all</Link>}>Recent activity</SectionHeader>
      {recent.length === 0 ? (
        <Panel><Empty>Tap your band at a booth to earn points.</Empty></Panel>
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
