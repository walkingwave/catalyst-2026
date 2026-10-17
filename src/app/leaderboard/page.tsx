import Link from "next/link";
import { requireFan, formatDate } from "@/lib/fan";
import { Page, Headline, List, Row, Panel, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ concert?: string; scope?: string }>;
}) {
  const { supabase, user } = await requireFan("/leaderboard");
  const sp = await searchParams;

  const { data: concerts } = await supabase
    .from("concerts")
    .select("id, name, artist, date")
    .order("date", { ascending: false });

  const all = sp.scope === "all";
  const concertId = !all ? sp.concert ?? concerts?.[0]?.id : undefined;
  const concert = concerts?.find((c) => c.id === concertId);

  const { data: rows } = concertId
    ? await supabase
        .from("leaderboard_concert")
        .select("user_id, name, points, rank")
        .eq("concert_id", concertId)
        .order("rank")
        .limit(50)
    : await supabase
        .from("leaderboard_alltime")
        .select("user_id, name, points, rank")
        .order("rank")
        .limit(50);

  return (
    <Page>
      <Header />
      <Headline sub={concert ? `${concert.name} · ${formatDate(concert.date)}` : "Across every show."}>
        Ranks
      </Headline>

      {/* Tabs: hard-edged, inverted when active */}
      <div className="flex border-2 border-line overflow-x-auto mb-4">
        <Tab href="/leaderboard?scope=all" active={all}>All-time</Tab>
        {concerts?.map((c) => (
          <Tab key={c.id} href={`/leaderboard?concert=${c.id}`} active={!all && c.id === concertId}>
            {c.artist}
          </Tab>
        ))}
      </div>

      {!rows || rows.length === 0 ? (
        <Panel>
          <Empty>Nobody on the board yet.</Empty>
        </Panel>
      ) : (
        <List>
          {rows.map((r) => {
            const me = r.user_id === user.id;
            return (
              <Row
                key={r.user_id}
                selected={me}
                leading={<span className="display d-md w-8 text-left t-num">{r.rank}</span>}
                title={
                  <>
                    {r.name || "Fan"}
                    {me && <span className="label ml-2 opacity-70">You</span>}
                  </>
                }
                value={<Points value={r.points} />}
              />
            );
          })}
        </List>
      )}
      <Nav />
    </Page>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 h-11 px-4 flex items-center label whitespace-nowrap border-r-2 border-line last:border-r-0 ${
        active ? "bg-invert-bg text-invert-fg" : "text-ink-2"
      }`}
    >
      {children}
    </Link>
  );
}
