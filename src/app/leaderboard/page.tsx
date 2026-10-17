import Link from "next/link";
import { requireFan, formatDate } from "@/lib/fan";
import { Page, LargeTitle, List, Row, Card, Empty, Points } from "@/components/ui";
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
      <LargeTitle sub={concert ? `${concert.name} · ${formatDate(concert.date)}` : "Across every show."}>
        Ranks
      </LargeTitle>

      {/* Segmented control */}
      <div className="flex gap-1 p-1 rounded-[12px] bg-surface-2 overflow-x-auto mb-4">
        <Seg href="/leaderboard?scope=all" active={all}>All-time</Seg>
        {concerts?.map((c) => (
          <Seg key={c.id} href={`/leaderboard?concert=${c.id}`} active={!all && c.id === concertId}>
            {c.artist}
          </Seg>
        ))}
      </div>

      {!rows || rows.length === 0 ? (
        <Card>
          <Empty>Nobody on the board yet.</Empty>
        </Card>
      ) : (
        <List>
          {rows.map((r) => {
            const me = r.user_id === user.id;
            return (
              <Row
                key={r.user_id}
                selected={me}
                leading={
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center t-subhead font-semibold ${
                      r.rank <= 3 ? "bg-accent text-on-accent" : "bg-surface-2 text-text-2"
                    }`}
                  >
                    {r.rank}
                  </span>
                }
                title={
                  <>
                    {r.name || "Fan"}
                    {me && <span className="t-footnote text-text-2 ml-1">(you)</span>}
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

function Seg({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 h-9 px-3 rounded-[9px] flex items-center t-subhead font-medium whitespace-nowrap ${
        active ? "bg-surface text-text card-shadow" : "text-text-2"
      }`}
    >
      {children}
    </Link>
  );
}
