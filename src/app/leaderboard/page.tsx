import Link from "next/link";
import { requireFan, formatDate } from "@/lib/fan";
import { Page, Card, Empty, Points } from "@/components/ui";
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
      <Header title="Leaderboard" />
      <h1 className="text-3xl font-bold mb-4">Ranks</h1>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mb-4">
        <Tab href="/leaderboard?scope=all" active={all}>
          All-time
        </Tab>
        {concerts?.map((c) => (
          <Tab key={c.id} href={`/leaderboard?concert=${c.id}`} active={!all && c.id === concertId}>
            {c.artist}
          </Tab>
        ))}
      </div>

      {concert && (
        <p className="text-muted text-sm mb-3">
          {concert.name} · {formatDate(concert.date)}
        </p>
      )}

      {!rows || rows.length === 0 ? (
        <Empty>Nobody on the board yet.</Empty>
      ) : (
        <Card className="p-0 divide-y divide-border">
          {rows.map((r) => {
            const me = r.user_id === user.id;
            return (
              <div
                key={r.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${me ? "bg-accent/10" : ""}`}
              >
                <span className={`w-8 font-mono ${r.rank <= 3 ? "text-accent" : "text-muted"}`}>
                  {r.rank}
                </span>
                <span className="flex-1 truncate font-medium">
                  {r.name || "Fan"} {me && <span className="text-muted text-xs">(you)</span>}
                </span>
                <Points value={r.points} className="text-foreground" />
              </div>
            );
          })}
        </Card>
      )}
      <Nav />
    </Page>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-4 h-10 flex items-center text-sm font-semibold border ${
        active ? "bg-accent text-accent-fg border-accent" : "bg-card border-border text-muted"
      }`}
    >
      {children}
    </Link>
  );
}
