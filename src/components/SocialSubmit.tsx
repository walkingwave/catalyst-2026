"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";

/** Fan pastes the link to their post for a social activity. */
export function SocialSubmit({ activityId, network, points }: { activityId: string; network: string | null; points: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<string | null>(null);

  return (
    <form
      className="px-4 py-3 space-y-2 bg-surface-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setState(null);
        const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activity_id: activityId, url }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setState(j.message ?? "Could not submit");
        setState("Submitted, pending approval.");
        setUrl("");
        router.refresh();
      }}
    >
      <p className="t-foot text-ink-2">Paste your {network ?? "post"} link. +{points} pts after approval.</p>
      <div className="flex gap-2">
        <Input type="url" placeholder="Post link" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button type="submit" disabled={busy || !url} className="h-14 px-4 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40">
          {busy ? "…" : "Submit"}
        </button>
      </div>
      {state && <p className={`t-foot ${state.startsWith("Submitted") ? "text-success" : "text-danger"}`}>{state}</p>}
    </form>
  );
}
