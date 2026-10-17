import { requireFan } from "@/lib/fan";
import { Page, Card, Empty, Points } from "@/components/ui";
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
      <Header
        right={
          <span className="text-sm">
            <Points value={balance} className="text-accent font-semibold" />{" "}
            <span className="text-muted">pts</span>
          </span>
        }
      />
      <h1 className="text-3xl font-bold mb-5">Rewards</h1>

      {!rewards || rewards.length === 0 ? (
        <Empty>No rewards yet.</Empty>
      ) : (
        <div className="space-y-3">
          {(rewards as Reward[]).map((r) => (
            <Card key={r.id}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-lg">{r.name}</p>
                  <p className="text-muted text-sm">{r.description}</p>
                  <p className="text-muted text-xs mt-1">
                    {r.stock > 0 ? `${r.stock} left` : "Sold out"} ·{" "}
                    {r.type === "discount_code" ? "Code" : "Pickup"}
                  </p>
                </div>
                <p className="text-accent font-mono text-lg whitespace-nowrap">
                  <Points value={r.cost} />
                </p>
              </div>
              <div className="mt-3">
                <RedeemButton reward={r} balance={balance} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {redemptions && redemptions.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-8 mb-3">Your redemptions</h2>
          <Card className="p-0 divide-y divide-border">
            {redemptions.map((rd) => {
              const reward = Array.isArray(rd.reward) ? rd.reward[0] : rd.reward;
              const code = Array.isArray(rd.code) ? rd.code[0] : rd.code;
              return (
                <div key={rd.id} className="px-4 py-3">
                  <p className="font-medium">{reward?.name}</p>
                  {code?.code ? (
                    <p className="font-mono text-accent text-lg tracking-wider mt-1">{code.code}</p>
                  ) : (
                    <p className="text-muted text-sm">Show this screen at pickup.</p>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
      <Nav />
    </Page>
  );
}
