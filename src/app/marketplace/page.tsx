import Link from "next/link";
import { requireFan } from "@/lib/fan";
import { Page, Headline, Panel, SectionHeader, Empty, Points, List, Row } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { RedeemButton } from "./RedeemButton";
import type { Artist, Reward } from "@/lib/types";

/** Rewards for one artist/team at a time. Defaults to the artist of the fan's latest show. */
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ artist?: string }> }) {
  const { supabase, user } = await requireFan("/marketplace");
  const sp = await searchParams;

  const [{ data: pools }, { data: artists }, { data: bands }, { data: redemptions }] = await Promise.all([
    supabase.from("user_artist_points").select("artist_id, balance").eq("user_id", user.id),
    supabase.from("artists").select("id, slug, name, kind, image_url").order("name"),
    supabase.from("bands").select("concert:concerts(artist_id, date)").eq("user_id", user.id),
    supabase
      .from("redemptions")
      .select("id, created_at, reward:rewards(name, type, artist_id), code:reward_codes(code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  // Latest show the fan holds a band for -> default artist.
  const latest = (bands ?? [])
    .map((b) => (Array.isArray(b.concert) ? b.concert[0] : b.concert) as { artist_id: string | null; date: string } | null)
    .filter((c): c is { artist_id: string | null; date: string } => !!c?.artist_id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const all = (artists ?? []) as Artist[];
  const artistId = sp.artist ?? latest?.artist_id ?? all[0]?.id;
  const artist = all.find((a) => a.id === artistId) ?? null;
  const balance = (pools ?? []).find((p) => p.artist_id === artistId)?.balance ?? 0;

  const { data: rewards } = artistId
    ? await supabase.from("rewards").select("*").eq("artist_id", artistId).order("cost")
    : { data: [] };
  const mine = (redemptions ?? []).filter((rd) => {
    const r = Array.isArray(rd.reward) ? rd.reward[0] : rd.reward;
    return r?.artist_id === artistId;
  });

  return (
    <Page>
      <Header />
      <Headline kicker={<><Points value={balance} /> pts with {artist?.name ?? "—"}</>}>Rewards</Headline>

      {all.length > 1 && (
        <div className="hscroll flex gap-1 overflow-x-auto mb-4 -mx-4 px-4">
          {all.map((a) => (
            <Link
              key={a.id}
              href={`/marketplace?artist=${a.id}`}
              className={`shrink-0 h-10 px-4 flex items-center label whitespace-nowrap ${a.id === artistId ? "bg-invert-bg text-invert-fg" : "bg-surface-2 text-ink-2"}`}
            >
              {a.name}
            </Link>
          ))}
        </div>
      )}

      {!rewards || rewards.length === 0 ? (
        <Empty>No rewards for {artist?.name ?? "this event"} yet.</Empty>
      ) : (
        <div className="space-y-3">
          {(rewards as Reward[]).map((r) => (
            <Panel key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="display d-md">{r.name}</p>
                  <p className="t-sub text-ink-2 mt-1">{r.description}</p>
                  <p className="label text-ink-2 mt-3">
                    {r.stock > 0 ? `${r.stock} left` : "Sold out"} · {r.type === "discount_code" ? "Digital code" : "Pick up at merch"}
                  </p>
                </div>
                <p className="display d-lg t-num whitespace-nowrap">{r.cost}</p>
              </div>
              <div className="mt-4">
                <RedeemButton reward={r} balance={balance} />
              </div>
            </Panel>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <>
          <SectionHeader>Redeemed</SectionHeader>
          <List>
            {mine.map((rd) => {
              const reward = Array.isArray(rd.reward) ? rd.reward[0] : rd.reward;
              const code = Array.isArray(rd.code) ? rd.code[0] : rd.code;
              return (
                <Row
                  key={rd.id}
                  title={reward?.name}
                  subtitle={code?.code ? "Code" : "Pick up at merch"}
                  value={code?.code ? <span className="font-mono tracking-wider">{code.code}</span> : undefined}
                />
              );
            })}
          </List>
        </>
      )}
      <Nav />
    </Page>
  );
}
