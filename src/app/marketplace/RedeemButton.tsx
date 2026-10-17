"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { IconCheck } from "@/components/icons";
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
      <div className="rounded-[12px] bg-success-soft p-4 text-center">
        <p className="t-subhead font-semibold text-success flex items-center justify-center gap-1">
          <IconCheck size={18} /> Redeemed
        </p>
        {code ? (
          <p className="font-mono text-[22px] tracking-widest mt-1 select-all">{code}</p>
        ) : (
          <p className="t-footnote text-text-2 mt-1">Show this screen at pickup.</p>
        )}
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div className="flex gap-2">
        <Button variant="tinted" size="md" onClick={() => setState("idle")}>
          Cancel
        </Button>
        <Button size="md" onClick={redeem}>
          Spend {reward.cost} pts
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button
        variant={disabled ? "tinted" : "filled"}
        size="md"
        disabled={disabled || state === "busy"}
        onClick={() => setState("confirm")}
      >
        {reward.stock <= 0
          ? "Sold out"
          : !canAfford
            ? `${(reward.cost - balance).toLocaleString()} more points needed`
            : state === "busy"
              ? "Redeeming…"
              : "Redeem"}
      </Button>
      {error && <p className="t-footnote text-danger mt-2 px-1">{error}</p>}
    </div>
  );
}
