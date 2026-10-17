import Link from "next/link";
import { requireFan, fanScans, timeAgo } from "@/lib/fan";
import { Page, Card, Points, Pill, Empty } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";

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
      .select("uid, concert:concerts(id, name, artist, venue, date)")
      .eq("user_id", user.id),
    fanScans(supabase),
    supabase.from("leaderboard_alltime").select("user_id, rank").eq("user_id", user.id).maybeSingle(),
  ]);

  // "Tonight" = the most recent concert the fan has a band for.
  const concerts = (bands ?? [])
    .map((b) => (Array.isArray(b.concert) ? b.concert[0] : b.concert))
    .filter(Boolean) as { id: string; name: string; artist: string; venue: string; date: string }[];
  concerts.sort((a, b) => (a.date < b.date ? 1 : -1));
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

  const recent = scans.slice(0, 8);

  return (
    <Page>
      <Header
        right={
          <form action="/auth/signout" method="post">
            <button className="text-muted text-sm">Sign out</button>
          </form>
        }
      />

      {claimed && (
        <div className="mb-4 rounded-2xl bg-accent/15 text-accent px-4 py-3 text-sm font-medium">
          Band claimed. Your points are saved.
        </div>
      )}

      <p className="text-muted">Hey {profile.name || "there"}</p>
      <h1 className="text-6xl font-bold tracking-tight mt-1">
        <Points value={pts?.balance ?? 0} className="text-accent" />
        <span className="text-2xl text-muted font-medium ml-2">pts</span>
      </h1>
      {pts && pts.spent > 0 && (
        <p className="text-muted text-sm mt-1">
          {pts.earned.toLocaleString()} earned · {pts.spent.toLocaleString()} spent
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Link href={tonight ? `/leaderboard?concert=${tonight.id}` : "/leaderboard"}>
          <Card>
            <p className="text-muted text-xs uppercase tracking-wide">Tonight</p>
            <p className="text-3xl font-bold mt-1">{tonightRank ? `#${tonightRank.rank}` : "—"}</p>
            <p className="text-muted text-xs mt-1 truncate">
              {tonight ? tonight.artist : "No show yet"}
            </p>
          </Card>
        </Link>
        <Link href="/leaderboard?scope=all">
          <Card>
            <p className="text-muted text-xs uppercase tracking-wide">All-time</p>
            <p className="text-3xl font-bold mt-1">{allTime ? `#${allTime.rank}` : "—"}</p>
            <p className="text-muted text-xs mt-1">
              {concerts.length} {concerts.length === 1 ? "show" : "shows"}
            </p>
          </Card>
        </Link>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {tonight && <Pill>{tonight.name}</Pill>}
      </div>
      {recent.length === 0 ? (
        <Empty>Tap your band at a booth to earn points.</Empty>
      ) : (
        <Card className="p-0 divide-y divide-border">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{s.activity?.name}</p>
                <p className="text-muted text-xs">{timeAgo(s.scanned_at)}</p>
              </div>
              <span className="text-accent font-mono">+{s.activity?.points}</span>
            </div>
          ))}
        </Card>
      )}

      <Nav />
    </Page>
  );
}
