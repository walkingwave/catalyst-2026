"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Field, List, Empty, Panel } from "@/components/ui";
import { IconX, IconChevron } from "@/components/icons";
import { ImageField } from "./ImageField";
import { call, json, type H } from "./api";
import type { Artist } from "@/lib/types";

type RewardRow = { id: string; name: string; description: string; cost: number; type: "merch" | "discount_code"; stock: number; codes: { total: number; free: number } };

/** Rewards + artist profile for one artist/team at a time. */
export function RewardsTab({ artists, headers, flash, onArtistsChanged }: { artists: Artist[]; headers: H; flash: (m: string) => void; onArtistsChanged: () => Promise<void> | void }) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [editing, setEditing] = useState<RewardRow | "new" | null>(null);
  const [profile, setProfile] = useState(false);
  const artist = artists.find((a) => a.id === artistId) ?? null;

  const load = useCallback(async () => {
    if (!artistId) return;
    const r = await call<{ rewards?: RewardRow[] }>(`/api/admin/rewards?artist_id=${artistId}`, headers);
    setRewards(r.rewards ?? []);
  }, [artistId, headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <>
      <label className="label text-ink-2 block mt-4 mb-2">Artist or team</label>
      <div className="flex gap-2">
        <select className="flex-1 min-w-0 h-14 bg-surface-2 px-4 t-body" value={artistId} onChange={(e) => setArtistId(e.target.value)}>
          {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={() => setProfile(true)} className="h-14 px-4 bg-surface-2 label shrink-0">Profile</button>
      </div>

      <div className="flex items-center justify-between pt-6 pb-2">
        <h2 className="display d-sm">{rewards.length} rewards</h2>
        <button onClick={() => setEditing("new")} className="h-9 px-3 bg-invert-bg text-invert-fg label">+ Add</button>
      </div>
      {rewards.length === 0 ? (
        <Empty>No rewards for {artist?.name ?? "this artist"} yet.</Empty>
      ) : (
        <List>
          {rewards.map((r) => (
            <button key={r.id} onClick={() => setEditing(r)} className="flex items-center w-full min-h-[56px] py-2 text-left press gap-3">
              <span className="flex-1 min-w-0">
                <span className="t-body block truncate">{r.name}</span>
                <span className="t-foot text-ink-2 block truncate">
                  {r.type === "discount_code" ? `${r.codes.free} of ${r.codes.total} codes left` : `${r.stock} in stock`} · {r.description || "No description"}
                </span>
              </span>
              <span className="display d-sm t-num">{r.cost}</span>
              <IconChevron size={16} className="text-ink-3" />
            </button>
          ))}
        </List>
      )}

      {editing && artist && (
        <RewardEditor
          reward={editing === "new" ? null : editing}
          artist={artist}
          headers={headers}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          flash={flash}
        />
      )}
      {profile && artist && (
        <ArtistEditor artist={artist} headers={headers} onClose={() => setProfile(false)} onChanged={onArtistsChanged} flash={flash} />
      )}
    </>
  );
}

function RewardEditor({ reward, artist, headers, onClose, onSaved, flash }: { reward: RewardRow | null; artist: Artist; headers: H; onClose: () => void; onSaved: () => Promise<void>; flash: (m: string) => void }) {
  const [f, setF] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    cost: String(reward?.cost ?? 100),
    type: reward?.type ?? ("merch" as "merch" | "discount_code"),
    stock: String(reward?.stock ?? 10),
    codes: "",
  });
  const [busy, setBusy] = useState(false);
  const codeList = f.codes.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    const r = reward
      ? await call("/api/admin/rewards", headers, { method: "PATCH", ...json({ id: reward.id, name: f.name, description: f.description, cost: Number(f.cost) || 0, ...(f.type === "merch" ? { stock: Number(f.stock) || 0 } : {}), add_codes: codeList }) })
      : await call("/api/admin/rewards", headers, { method: "POST", ...json({ artist_id: artist.id, name: f.name, description: f.description, cost: Number(f.cost) || 0, type: f.type, stock: Number(f.stock) || 0, codes: codeList }) });
    setBusy(false);
    if (!r.ok) return flash(r.message ?? "Save failed");
    flash(reward ? "Reward saved" : "Reward added");
    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-testid="reward-editor">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="h-11 px-2 -ml-2 label flex items-center gap-1 press"><IconChevron size={18} className="rotate-180" /> Rewards</button>
        <span className="label text-ink-2">{artist.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
        <h2 className="display d-lg">{reward ? "Edit reward" : "New reward"}</h2>
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost (pts)"><Input inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/\D/g, "") })} /></Field>
          {f.type === "merch" ? (
            <Field label="Stock"><Input inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value.replace(/\D/g, "") })} /></Field>
          ) : (
            <Field label="Codes left"><Input value={reward ? String(reward.codes.free) : String(codeList.length)} readOnly /></Field>
          )}
        </div>
        {!reward && (
          <div className="flex gap-1 bg-surface-2 p-1">
            <button type="button" onClick={() => setF({ ...f, type: "merch" })} className={`flex-1 h-9 label ${f.type === "merch" ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>Merch pickup</button>
            <button type="button" onClick={() => setF({ ...f, type: "discount_code" })} className={`flex-1 h-9 label ${f.type === "discount_code" ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>Discount codes</button>
          </div>
        )}
        {f.type === "discount_code" && (
          <Field label={reward ? "Add codes (one per line)" : "Codes (one per line)"}>
            <textarea className="w-full min-h-24 bg-surface-2 p-3 font-mono t-sub outline-none" value={f.codes} onChange={(e) => setF({ ...f, codes: e.target.value })} placeholder={"MERCH20-001\nMERCH20-002"} />
          </Field>
        )}
        <Button disabled={busy || !f.name.trim()} onClick={save}>{busy ? "Saving…" : reward ? "Save" : "Add reward"}</Button>
        {reward && (
          <Button
            variant="danger"
            size="md"
            onClick={async () => {
              if (!window.confirm(`Delete "${reward.name}"?`)) return;
              const r = await call(`/api/admin/rewards?id=${reward.id}`, headers, { method: "DELETE" });
              if (!r.ok) return flash(r.message ?? "Delete failed");
              flash("Reward deleted");
              await onSaved();
            }}
          >
            Delete reward
          </Button>
        )}
      </div>
    </div>
  );
}

function ArtistEditor({ artist, headers, onClose, onChanged, flash }: { artist: Artist; headers: H; onClose: () => void; onChanged: () => Promise<void> | void; flash: (m: string) => void }) {
  const [f, setF] = useState({ name: artist.name, kind: artist.kind, bio: artist.bio ?? "", access_code: artist.access_code ?? "" });
  async function save(fields: Record<string, unknown>) {
    const r = await call("/api/admin/artists", headers, { method: "PATCH", ...json({ id: artist.id, ...fields }) });
    if (!r.ok) return flash(r.message ?? "Save failed");
    await onChanged();
  }
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-testid="artist-editor">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="h-11 px-2 -ml-2 label flex items-center gap-1 press"><IconChevron size={18} className="rotate-180" /> Rewards</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
        <h2 className="display d-lg">{f.name}</h2>
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => f.name !== artist.name && save({ name: f.name })} /></Field>
        <div className="flex gap-1 bg-surface-2 p-1">
          {(["artist", "team"] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setF({ ...f, kind: k }); void save({ kind: k }); }} className={`flex-1 h-9 label ${f.kind === k ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>{k}</button>
          ))}
        </div>
        <Field label="Bio">
          <textarea className="w-full min-h-20 bg-surface-2 p-3 t-body outline-none" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} onBlur={() => f.bio !== (artist.bio ?? "") && save({ bio: f.bio })} />
        </Field>
        <ImageField label="Photo" value={artist.image_url} folder="artists" headers={headers} aspect="aspect-[4/5]" onChange={(url) => void save({ image_url: url })} />
        <Field label="Console access code"><Input value={f.access_code} onChange={(e) => setF({ ...f, access_code: e.target.value })} onBlur={() => f.access_code !== (artist.access_code ?? "") && save({ access_code: f.access_code })} autoCapitalize="characters" /></Field>
        <Panel className="p-3"><p className="t-foot text-ink-2">The artist signs into /artist with this code. Changes save when you leave a field.</p></Panel>
        <p className="t-foot text-ink-2 flex items-center gap-1"><IconX size={12} /> Deleting an artist removes their rewards; do it from the API if you really need to.</p>
      </div>
    </div>
  );
}
