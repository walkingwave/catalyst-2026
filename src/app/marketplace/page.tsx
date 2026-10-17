import Link from "next/link";
import { requireFan } from "@/lib/fan";
import { attendedArtists } from "@/lib/current";
import { Page, Headline, Panel, SectionHeader, Empty, Points, List, Row } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { RedeemButton } from "./RedeemButton";
import { IconChevron } from "@/components/icons";
import type { Reward } from "@/lib/types";

/** Rewards for the current event only. Points shown are that event's pool. */
export default async function MarketplacePage() {
  const { supabase, user } = await requireFan("/marketplace");
  const { current } = await attendedArtists(supabase, user.id);
  const artistId = current?.artist.id;

  const [{ data: rewards }, { data: redemptions }] = await Promise.all([
    artistId ? supabase.from("rewards").select("*").eq("artist_id", artistId).order("cost") : Promise.resolve({ data: [] as Reward[] }),
    supabase
      .from("redemptions")
      .select("id, created_at, reward:rewards(name, type, artist_id), code:reward_codes(code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const mine = (redemptions ?? []).filter((rd) => {
    const r = Array.isArray(rd.reward) ? rd.reward[0] : rd.reward;
    return r?.artist_id === artistId;
  });
  const balance = current?.balance ?? 0;

  return (
    <Page>
      <Header />
      <Headline>Rewards</Headline>

      {/* Event + points counter */}
      <Link href="/events?next=/marketplace" className="block bg-invert-bg text-invert-fg p-5 press" data-testid="rewards-counter">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="mono-caps text-[10px] opacity-70">Current event</p>
            <p className="display d-md truncate mt-1">{current ? current.artist.name : "No event yet"}</p>
          </div>
          <span className="label opacity-70 flex items-center gap-1 shrink-0">Switch <IconChevron size={16} /></span>
        </div>
        <div className="flex items-end gap-3 mt-5">
          <Points value={balance} className="display text-[64px] leading-[0.8]" />
          <span className="display d-md pb-1">pts to spend</span>
        </div>
      </Link>

      <SectionHeader>Available</SectionHeader>
      {!rewards || rewards.length === 0 ? (
        <Empty>No rewards for {current?.artist.name ?? "this event"} yet.</Empty>
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
