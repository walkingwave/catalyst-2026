import Link from "next/link";
import { requireFan, formatDate } from "@/lib/fan";
import { Page, Headline, List, Row, Panel, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ concert?: string; artist?: string; scope?: string }>;
}) {
  const { supabase, user } = await requireFan("/leaderboard");
  const sp = await searchParams;

  const [{ data: artists }, { data: concerts }, { data: pools }] = await Promise.all([
    supabase.from("artists").select("id, name, kind").order("name"),
    supabase.from("concerts").select("id, name, artist, artist_id, date").order("date", { ascending: false }),
    supabase.from("user_artist_points").select("artist_id, balance").eq("user_id", user.id).order("balance", { ascending: false }),
  ]);

  const mode: "artist" | "concert" = sp.concert ? "concert" : "artist";
  // Default to the fan's biggest fandom, then the first artist.
  const artistId = mode === "artist" ? sp.artist ?? pools?.[0]?.artist_id ?? artists?.[0]?.id : undefined;
  const artist = artists?.find((a) => a.id === artistId);
  const concert = concerts?.find((c) => c.id === sp.concert);

  const { data: rows } =
    mode === "concert"
      ? await supabase.from("leaderboard_concert").select("user_id, name, points, rank").eq("concert_id", sp.concert!).order("rank").limit(50)
      : await supabase.from("leaderboard_artist").select("user_id, name, points, rank").eq("artist_id", artistId!).order("rank").limit(50);

  const artistShows = (concerts ?? []).filter((c) => c.artist_id === (concert?.artist_id ?? artistId));

  return (
    <Page>
      <Header />
      <Headline
        kicker={mode === "concert" ? "Single show" : artist?.kind === "team" ? "Team fandom" : "Artist fandom"}
        sub={
          mode === "concert"
            ? `${concert?.name} · ${formatDate(concert!.date)}`
            : "All-time points with this artist. Pools are per artist, not shared."
        }
      >
        {mode === "concert" ? concert?.artist : artist?.name}
      </Headline>

      <div className="flex border-2 border-line overflow-x-auto mb-3">
        {artists?.map((a) => (
          <Tab key={a.id} href={`/leaderboard?artist=${a.id}`} active={mode === "artist" && a.id === artistId}>
            {a.name}
          </Tab>
        ))}
      </div>
      {artistShows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mb-4">
          <Chip href={`/leaderboard?artist=${concert?.artist_id ?? artistId}`} active={mode === "artist"}>All-time</Chip>
          {artistShows.map((c) => (
            <Chip key={c.id} href={`/leaderboard?concert=${c.id}`} active={sp.concert === c.id}>
              {formatDate(c.date)}
            </Chip>
          ))}
        </div>
      )}

      {!rows || rows.length === 0 ? (
        <Panel><Empty>Nobody on the board yet.</Empty></Panel>
      ) : (
        <List>
          {rows.map((r) => {
            const me = r.user_id === user.id;
            return (
              <Row
                key={r.user_id}
                selected={me}
                leading={<span className="display d-md w-8 text-left t-num">{r.rank}</span>}
                title={<>{r.name || "Fan"}{me && <span className="label ml-2 opacity-70">You</span>}</>}
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

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`shrink-0 h-9 px-3 flex items-center t-foot font-semibold border border-line ${active ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
      {children}
    </Link>
  );
}
