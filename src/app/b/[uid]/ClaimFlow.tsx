"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneOtpForm } from "@/components/PhoneOtpForm";
import { Button } from "@/components/ui";

async function claim(uid: string, name?: string): Promise<string | void> {
  const res = await fetch("/api/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uid, name }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || !json.ok) return json.message ?? "Could not claim band";
}

export function ClaimFlow({ uid, signedIn }: { uid: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go() {
    router.replace("/dashboard?claimed=1");
    router.refresh();
  }

  // Already signed in (e.g. fan with a band from a previous show): one tap.
  if (signedIn) {
    return (
      <div className="space-y-3">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await claim(uid);
            setBusy(false);
            if (err) return setError(err);
            go();
          }}
        >
          {busy ? "Claiming…" : "Add to my account"}
        </Button>
        {error && <p className="t-foot text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <PhoneOtpForm
      submitLabel="Claim"
      onVerified={async () => {
        const err = await claim(uid);
        if (err) return err;
        go();
      }}
    />
  );
}
