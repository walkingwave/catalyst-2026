"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { Reward } from "@/lib/types";

export function RedeemButton({ reward, balance }: { reward: Reward; balance: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAfford = balance >= reward.cost;
  const disabled = reward.stock <= 0 || !canAfford;

  async function redeem() {
    setState("busy");
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: reward.id });
    if (error) {
      setError(error.message.replace(/^.*?:\s*/, ""));
      setState("idle");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setCode(row?.code ?? null);
    setState("done");
    router.refresh();
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-accent/15 p-4 text-center">
        <p className="text-accent font-semibold">Redeemed!</p>
        {code ? (
          <p className="font-mono text-2xl tracking-widest mt-1 select-all">{code}</p>
        ) : (
          <p className="text-sm text-muted mt-1">Show this screen at pickup.</p>
        )}
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setState("idle")}>
          Cancel
        </Button>
        <Button onClick={redeem}>Spend {reward.cost}</Button>
      </div>
    );
  }

  return (
    <div>
      <Button
        variant={disabled ? "secondary" : "primary"}
        disabled={disabled || state === "busy"}
        onClick={() => setState("confirm")}
      >
        {reward.stock <= 0
          ? "Sold out"
          : !canAfford
            ? `Need ${(reward.cost - balance).toLocaleString()} more`
            : state === "busy"
              ? "Redeeming…"
              : "Redeem"}
      </Button>
      {error && <p className="text-danger text-sm mt-2">{error}</p>}
    </div>
  );
}
