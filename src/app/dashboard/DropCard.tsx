"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui";
import { IconGift } from "@/components/icons";
import type { Drop } from "@/lib/types";

export function DropCard({ drop }: { drop: Drop & { artist_name: string } }) {
  const [claimed, setClaimed] = useState(!!drop.claimed_at);
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("drops").update({ claimed_at: new Date().toISOString() }).eq("id", drop.id);
    setBusy(false);
    setClaimed(true);
  }

  return (
    <Panel invert className="p-4" data-testid="drop-card">
      <div className="flex items-center gap-2">
        <IconGift size={18} />
        <p className="label text-invert-fg/70">Drop from {drop.artist_name}</p>
      </div>
      {drop.image_url && (
        <div className="relative w-full aspect-[16/9] mt-3 overflow-hidden">
          <Image src={drop.image_url} alt="" fill className="object-cover" unoptimized />
        </div>
      )}
      <p className="display d-md mt-3">{drop.title}</p>
      {drop.message && <p className="t-sub text-invert-fg/80 mt-2">{drop.message}</p>}
      {claimed ? (
        drop.code ? (
          <p className="font-mono text-[22px] tracking-widest mt-4 select-all">{drop.code}</p>
        ) : (
          <p className="label mt-4">Claimed</p>
        )
      ) : (
        <div className="mt-4">
          <button
            onClick={claim}
            disabled={busy}
            className="w-full h-12 bg-invert-fg text-invert-bg display d-sm disabled:opacity-40 press"
          >
            {busy ? "…" : "Claim"}
          </button>
        </div>
      )}
    </Panel>
  );
}
