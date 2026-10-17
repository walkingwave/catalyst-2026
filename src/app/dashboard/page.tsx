import Image from "next/image";
import Link from "next/link";
import { requireFan, fanScans, timeAgo, formatDate } from "@/lib/fan";
import { Page, Card, Points, List, Row, StatTile, SectionHeader, Banner, Empty } from "@/components/ui";
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
            <button className="t-subhead text-accent h-11 px-2">Sign out</button>
          </form>
        }
      />

      {claimed && (
        <div className="mb-3">
          <Banner>Band claimed. Your points are saved to this number.</Banner>
        </div>
      )}

      <div className="pt-2 pb-4">
        <p className="t-subhead text-text-2">Hi {firstName}</p>
        <div className="flex items-baseline gap-2">
          <Points value={pts?.balance ?? 0} className="t-large-title text-[44px] leading-[52px]" />
          <span className="t-headline text-text-2">points</span>
        </div>
        {pts && pts.spent > 0 && (
          <p className="t-footnote text-text-2">
            {pts.earned.toLocaleString()} earned · {pts.spent.toLocaleString()} redeemed
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
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
          <SectionHeader>Tonight</SectionHeader>
          <Link href={`/concerts/${tonight.id}`} className="block active:opacity-70">
            <Card className="overflow-hidden">
              {tonight.image_url && (
                <div className="relative aspect-[16/9]">
                  <Image src={tonight.image_url} alt={tonight.artist} fill className="object-cover" priority />
                </div>
              )}
              <div className="flex items-center px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="t-headline truncate">{tonight.artist}</p>
                  <p className="t-footnote text-text-2 truncate">
                    {tonight.venue} · {formatDate(tonight.date)}
                  </p>
                </div>
                <span className="t-subhead text-accent mr-1">Venue map</span>
                <IconChevron size={18} className="text-text-3" />
              </div>
            </Card>
          </Link>
        </>
      )}

      <SectionHeader action={<Link href="/concerts">See all</Link>}>Recent activity</SectionHeader>
      {recent.length === 0 ? (
        <Card>
          <Empty>Tap your band at a booth to earn points.</Empty>
        </Card>
      ) : (
        <List>
          {recent.map((s) => (
            <Row
              key={s.id}
              title={s.activity?.name}
              subtitle={timeAgo(s.scanned_at)}
              value={`+${s.activity?.points}`}
              valueTone="success"
            />
          ))}
        </List>
      )}

      <Nav />
    </Page>
  );
}
