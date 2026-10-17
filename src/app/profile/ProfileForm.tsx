"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Field, Panel } from "@/components/ui";

type Values = { name: string; instagram: string; tiktok: string; x_handle: string };

export function ProfileForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel className="p-4">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
          const j = await r.json().catch(() => ({}));
          setBusy(false);
          setMsg(r.ok ? "Saved" : j.message ?? "Could not save");
          if (r.ok) router.refresh();
        }}
      >
        <Field label="Name">
          <Input value={v.name} onChange={set("name")} maxLength={60} autoComplete="name" />
        </Field>
        <Field label="Instagram">
          <Input value={v.instagram} onChange={set("instagram")} placeholder="@handle" autoCapitalize="none" />
        </Field>
        <Field label="TikTok">
          <Input value={v.tiktok} onChange={set("tiktok")} placeholder="@handle" autoCapitalize="none" />
        </Field>
        <Field label="X">
          <Input value={v.x_handle} onChange={set("x_handle")} placeholder="@handle" autoCapitalize="none" />
        </Field>
        {msg && <p className={`t-foot ${msg === "Saved" ? "text-success" : "text-danger"}`}>{msg}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Panel>
  );
}
