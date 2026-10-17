import { requireFan } from "@/lib/fan";
import { Page, Headline, Panel, List, Row, SectionHeader, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { RedeemButton } from "./RedeemButton";
import type { Reward } from "@/lib/types";

export default async function MarketplacePage() {
  const { supabase, user } = await requireFan("/marketplace");

  const [{ data: pts }, { data: rewards }, { data: redemptions }] = await Promise.all([
    supabase.from("user_points").select("balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("rewards").select("*").order("cost"),
    supabase
      .from("redemptions")
      .select("id, created_at, reward:rewards(name, type), code:reward_codes(code)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const balance = pts?.balance ?? 0;

  return (
    <Page>
      <Header />
      <Headline
        kicker={<><Points value={balance} /> pts to spend</>}
        sub="Trade points for merch and codes. Pick-ups happen at the merch booth tonight."
      >
        Rewards
      </Headline>

      {!rewards || rewards.length === 0 ? (
        <Panel>
          <Empty>No rewards yet.</Empty>
        </Panel>
      ) : (
        <div className="space-y-3">
          {(rewards as Reward[]).map((r) => (
            <Panel key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="display d-md">{r.name}</p>
                  <p className="t-sub text-ink-2 mt-1">{r.description}</p>
                  <p className="label text-ink-2 mt-3">
                    {r.stock > 0 ? `${r.stock} left` : "Sold out"} ·{" "}
                    {r.type === "discount_code" ? "Digital code" : "Pick up at merch"}
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

      {redemptions && redemptions.length > 0 && (
        <>
          <SectionHeader>Your redemptions</SectionHeader>
          <List>
            {redemptions.map((rd) => {
              const reward = Array.isArray(rd.reward) ? rd.reward[0] : rd.reward;
              const code = Array.isArray(rd.code) ? rd.code[0] : rd.code;
              return (
                <Row
                  key={rd.id}
                  title={reward?.name}
                  subtitle={code?.code ? "Show this code at the booth" : "Show this screen at pickup"}
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
