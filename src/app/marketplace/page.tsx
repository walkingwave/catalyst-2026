import { requireFan } from "@/lib/fan";
import { Page, Headline, Panel, List, Row, SectionHeader, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { RedeemButton } from "./RedeemButton";
import type { Artist, Reward } from "@/lib/types";

export default async function MarketplacePage() {
  const { supabase, user } = await requireFan("/marketplace");

  const [{ data: pools }, { data: artists }, { data: rewards }, { data: redemptions }] = await Promise.all([
    supabase.from("user_artist_points").select("artist_id, balance").eq("user_id", user.id),
    supabase.from("artists").select("id, slug, name, kind, image_url").order("name"),
    supabase.from("rewards").select("*").order("cost"),
    supabase
      .from("redemptions")
      .select("id, created_at, reward:rewards(name, type), code:reward_codes(code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const balanceBy = new Map((pools ?? []).map((p) => [p.artist_id, p.balance]));
  const groups = (artists ?? [])
    .map((a) => ({ artist: a as Artist, balance: balanceBy.get(a.id) ?? 0, rewards: ((rewards ?? []) as Reward[]).filter((r) => r.artist_id === a.id) }))
    .filter((g) => g.rewards.length > 0)
    .sort((a, b) => b.balance - a.balance);

  return (
    <Page>
      <Header />
      <Headline>Rewards</Headline>

      {groups.length === 0 ? (
        <Panel><Empty>No rewards.</Empty></Panel>
      ) : (
        groups.map((g) => (
          <section key={g.artist.id}>
            <SectionHeader action={<><Points value={g.balance} /> pts</>}>{g.artist.name}</SectionHeader>
            <div className="space-y-3">
              {g.rewards.map((r) => (
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
                    <RedeemButton reward={r} balance={g.balance} />
                  </div>
                </Panel>
              ))}
            </div>
          </section>
        ))
      )}

      {redemptions && redemptions.length > 0 && (
        <>
          <SectionHeader>Redeemed</SectionHeader>
          <List>
            {redemptions.map((rd) => {
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
