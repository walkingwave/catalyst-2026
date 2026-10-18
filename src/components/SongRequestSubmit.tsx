"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";

/** Fan requests a song for the show. Same box as SocialSubmit; points land immediately. */
export function SongRequestSubmit({ activityId, points }: { activityId: string; points: number }) {
  const router = useRouter();
  const [song, setSong] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="px-4 py-3 space-y-2 bg-surface-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await fetch("/api/activities/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activity_id: activityId, response: song }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setError(j.message ?? "Could not submit");
        setSong("");
        router.refresh();
      }}
    >
      <p className="t-foot text-ink-2">Which song do you want to hear? +{points} pts when you send it.</p>
      <div className="flex gap-2">
        <Input placeholder="Song title" value={song} maxLength={120} onChange={(e) => setSong(e.target.value)} required />
        <button type="submit" disabled={busy || !song.trim()} className="h-14 px-4 bg-invert-bg text-invert-fg display d-sm disabled:opacity-40 press">
          {busy ? "…" : "Submit"}
        </button>
      </div>
      {error && <p className="t-foot text-danger">{error}</p>}
    </form>
  );
}
