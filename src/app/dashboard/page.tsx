import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, timeAgo, formatDate } from "@/lib/fan";
import { Page, Panel, Points, List, Row, StatTile, SectionHeader, Banner, Empty } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { IconChevron } from "@/components/icons";
import type { Concert } from "@/lib/types";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ claimed?: string }>;
}) {
  const { supabase, user, profile } = await requireFan("/dashboard");
  const { claimed } = await searchParams;

  const [{ data: pts }, { data: bands }, scans, { data: allTime }] = await Promise.all([
    supabase.from("user_points").select("earned, spent, balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("bands")
      .select("uid, concert:concerts(id, name, artist, venue, date, image_url)")
      .eq("user_id", user.id),
    fanScans(supabase),
    supabase.from("leaderboard_alltime").select("user_id, rank").eq("user_id", user.id).maybeSingle(),
  ]);

  const byId = new Map<string, Concert>();
  for (const b of bands ?? []) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as Concert | null;
    if (c) byId.set(c.id, c);
  }
  const concerts = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const tonight = concerts[0];

  let tonightRank: { rank: number; total: number } | null = null;
  if (tonight) {
    const { data: lb } = await supabase
      .from("leaderboard_concert")
      .select("user_id, rank")
      .eq("concert_id", tonight.id);
    const me = lb?.find((r) => r.user_id === user.id);
    if (me) tonightRank = { rank: me.rank, total: lb?.length ?? 0 };
  }

  const recent = scans.slice(0, 6);
  const firstName = (profile.name || "there").split(" ")[0];

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

      {/* Points hero: inverted block */}
      <Panel invert className="p-5 mt-2">
        <p className="label text-invert-fg/70">Hey {firstName}, you have</p>
        <div className="flex items-end gap-3 mt-3">
          <Points value={pts?.balance ?? 0} className="display text-[72px] leading-[0.85]" />
          <span className="display d-md pb-1">pts</span>
        </div>
        {pts && pts.spent > 0 && (
          <p className="t-foot text-invert-fg/70 mt-3">
            {pts.earned.toLocaleString()} earned · {pts.spent.toLocaleString()} redeemed
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <StatTile
          label="Tonight"
          value={tonightRank ? `#${tonightRank.rank}` : "—"}
          sub={tonightRank ? `of ${tonightRank.total} fans` : "No show yet"}
          href={tonight ? `/leaderboard?concert=${tonight.id}` : "/leaderboard"}
        />
        <StatTile
          label="All-time"
          value={allTime ? `#${allTime.rank}` : "—"}
          sub={`${concerts.length} ${concerts.length === 1 ? "show" : "shows"}`}
          href="/leaderboard?scope=all"
        />
      </div>

      {tonight && (
        <>
          <SectionHeader action={formatDate(tonight.date)}>Tonight</SectionHeader>
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
              <div className="flex items-center px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="t-body truncate">{tonight.venue}</p>
                  <p className="t-foot text-ink-2 truncate">{tonight.name}</p>
                </div>
                <span className="label mr-1">Venue map</span>
                <IconChevron size={18} className="text-ink-3" />
              </div>
            </Panel>
          </Link>
        </>
      )}

      <SectionHeader action={<Link href="/concerts">See all</Link>}>Recent activity</SectionHeader>
      {recent.length === 0 ? (
        <Panel>
          <Empty>Tap your band at a booth to earn points.</Empty>
        </Panel>
      ) : (
        <List>
          {recent.map((s) => (
            <Row
              key={s.id}
              title={s.activity?.name}
              subtitle={timeAgo(s.scanned_at)}
              value={`+${s.activity?.points}`}
            />
          ))}
        </List>
      )}

      <Nav />
    </Page>
  );
}
