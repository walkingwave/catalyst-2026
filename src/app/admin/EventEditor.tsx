"use client";

import { useState } from "react";
import { Button, Input, Field, List, SectionHeader, Empty } from "@/components/ui";
import { IconChevron, IconX } from "@/components/icons";
import { VenueMap } from "@/components/VenueMap";
import { ImageField } from "@/components/ImageField";
import { call, json, type H } from "./api";
import type { Activity, Artist, Concert } from "@/lib/types";

export type EventRow = Concert & { activities: Activity[]; bands: { total: number; claimed: number } };

/**
 * Full-screen editor for one event: details, photos, venue map + activity pins, activities, danger zone.
 * Saves field-by-field on blur / on action so there's no big "save" step to forget.
 */
export function EventEditor({
  event,
  artists,
  headers,
  onClose,
  onChanged,
  flash,
}: {
  event: EventRow;
  artists: Artist[];
  headers: H;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  flash: (m: string) => void;
}) {
  const [section, setSection] = useState<"details" | "media" | "activities">("details");
  const [form, setForm] = useState({
    name: event.name,
    description: event.description ?? "",
    venue: event.venue,
    address: event.address ?? "",
    date: event.date,
    doors_at: event.doors_at ?? "",
    artist_id: event.artist_id ?? "",
  });

  async function save(fields: Record<string, unknown>) {
    const r = await call("/api/admin/events", headers, { method: "PATCH", ...json({ id: event.id, ...fields }) });
    if (!r.ok) return flash(r.message ?? "Save failed");
    await onChanged();
  }
  const blur = (k: keyof typeof form) => () => {
    const v = form[k];
    const cur = (event as unknown as Record<string, unknown>)[k] ?? "";
    if (v !== cur) void save({ [k]: v });
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-testid="event-editor">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="h-11 px-2 -ml-2 label flex items-center gap-1 press"><IconChevron size={18} className="rotate-180" /> Events</button>
        <span className="label text-ink-2">{event.bands.total} bands</span>
      </div>
      <div className="px-4">
        <h2 className="display d-lg truncate">{form.name || "Event"}</h2>
        <div className="flex gap-1 bg-surface-2 p-1 mt-3">
          {(["details", "media", "activities"] as const).map((s) => (
            <button key={s} onClick={() => setSection(s)} className={`flex-1 h-10 label ${section === s ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
              {s === "details" ? "Details" : s === "media" ? "Photos & map" : "Activities"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {section === "details" && (
          <div className="space-y-4">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={blur("name")} /></Field>
            <Field label="Description">
              <textarea className="w-full min-h-20 bg-surface-2 p-3 t-body outline-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} onBlur={blur("description")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Venue"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} onBlur={blur("venue")} /></Field>
              <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} onBlur={blur("date")} /></Field>
              <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} onBlur={blur("address")} /></Field>
              <Field label="Doors"><Input value={form.doors_at} onChange={(e) => setForm({ ...form, doors_at: e.target.value })} onBlur={blur("doors_at")} /></Field>
            </div>
            <Field label="Artist or team">
              <select
                className="w-full h-14 bg-surface-2 px-4 t-body"
                value={form.artist_id}
                onChange={(e) => {
                  setForm({ ...form, artist_id: e.target.value });
                  void save({ artist_id: e.target.value || null });
                }}
              >
                <option value="">None</option>
                {artists.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
              </select>
            </Field>
            <p className="t-foot text-ink-2">Changes save when you leave a field.</p>

            <SectionHeader>Danger</SectionHeader>
            <Button
              variant="danger"
              size="md"
              onClick={async () => {
                if (!window.confirm(`Delete "${event.name}" and all its bands and scans?`)) return;
                const r = await call(`/api/admin/events?id=${event.id}`, headers, { method: "DELETE" });
                if (!r.ok) return flash(r.message ?? "Delete failed");
                flash("Event deleted");
                await onChanged();
                onClose();
              }}
            >
              Delete event
            </Button>
          </div>
        )}

        {section === "media" && (
          <div className="space-y-6">
            <ImageField label="Artist photo (hero)" value={event.image_url} folder="events" headers={headers} aspect="aspect-[4/5]" onChange={(url) => void save({ image_url: url })} />
            <ImageField label="Venue photo" value={event.venue_image_url} folder="venues" headers={headers} onChange={(url) => void save({ venue_image_url: url })} />
            <ImageField label="Venue map (replaces the drawn floor plan)" value={event.map_image_url} folder="maps" headers={headers} aspect="aspect-[4/3]" onChange={(url) => void save({ map_image_url: url })} />
          </div>
        )}

        {section === "activities" && <ActivitiesEditor event={event} headers={headers} onChanged={onChanged} flash={flash} />}
      </div>
    </div>
  );
}

/* ---------------- Activities: add / edit / delete, pin placement on the map ---------------- */

function ActivitiesEditor({ event, headers, onChanged, flash }: { event: EventRow; headers: H; onChanged: () => Promise<void> | void; flash: (m: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  type Kind = "scan" | "social" | "song_request";
  const blank = { name: "", points: "50", location: "", kind: "scan" as Kind, social_network: "instagram", pre_event: false };
  const [draft, setDraft] = useState<typeof blank>(blank);
  const [placing, setPlacing] = useState<string | null>(null);
  const scanActs = event.activities.filter((a) => (a.kind ?? "scan") === "scan");

  function startEdit(a: Activity) {
    setEditing(a.id);
    setDraft({ name: a.name, points: String(a.points), location: a.location ?? "", kind: a.kind ?? "scan", social_network: a.social_network ?? "instagram", pre_event: !!a.pre_event });
  }
  async function submit() {
    const body = { name: draft.name, points: Number(draft.points) || 0, location: draft.location || null, kind: draft.kind, social_network: draft.kind === "social" ? draft.social_network : null, pre_event: draft.kind !== "scan" && draft.pre_event };
    const r = editing === "new"
      ? await call("/api/admin/activities", headers, { method: "POST", ...json({ concert_id: event.id, ...body }) })
      : await call("/api/admin/activities", headers, { method: "PATCH", ...json({ id: editing, ...body }) });
    if (!r.ok) return flash(r.message ?? "Save failed");
    setEditing(null);
    await onChanged();
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this activity? Scans on it are removed.")) return;
    const r = await call(`/api/admin/activities?id=${id}`, headers, { method: "DELETE" });
    if (!r.ok) return flash(r.message ?? "Delete failed");
    await onChanged();
  }
  async function place(x: number, y: number) {
    if (!placing) return;
    const r = await call("/api/admin/activities", headers, { method: "PATCH", ...json({ id: placing, map_x: Math.round(x * 10) / 10, map_y: Math.round(y * 10) / 10 }) });
    if (!r.ok) return flash(r.message ?? "Save failed");
    setPlacing(null);
    await onChanged();
  }
  const total = event.activities.reduce((n, a) => n + a.points, 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="label text-ink-2">Map · {placing ? "tap where the pin goes" : "tap a pin, then Place to move it"}</p>
          {placing && <button onClick={() => setPlacing(null)} className="label">Cancel</button>}
        </div>
        <VenueMap activities={scanActs} venue={event.venue} imageUrl={event.map_image_url} onPlace={placing ? place : undefined} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="display d-sm">{event.activities.length} activities · {total} pts</p>
        <button onClick={() => { setEditing("new"); setDraft(blank); }} className="h-9 px-3 bg-invert-bg text-invert-fg label">+ Add</button>
      </div>

      {editing && (
        <div className="bg-surface-2 p-4 space-y-3" data-testid="activity-form">
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            <Input placeholder="pts" inputMode="numeric" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value.replace(/\D/g, "") })} />
          </div>
          <Input placeholder="Location (e.g. Main lobby)" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          <div className="flex gap-1 bg-surface p-1">
            {([["scan", "Live concert"], ["social", "Digital"], ["song_request", "Poll"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k, pre_event: k === "scan" ? false : draft.pre_event })} className={`flex-1 h-9 label ${draft.kind === k ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>{label}</button>
            ))}
          </div>
          {draft.kind !== "scan" && (
            <label className="flex items-center gap-3 min-h-11 t-sub">
              <input type="checkbox" className="w-5 h-5 accent-current" checked={draft.pre_event} onChange={(e) => setDraft({ ...draft, pre_event: e.target.checked })} />
              Pre-event: fans can do this before the show; it locks when doors open
            </label>
          )}
          {draft.kind === "social" && (
            <select className="w-full h-12 bg-surface px-3 t-sub" value={draft.social_network} onChange={(e) => setDraft({ ...draft, social_network: e.target.value })}>
              <option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="x">X</option>
            </select>
          )}
          <div className="flex gap-2">
            <Button size="md" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="md" disabled={!draft.name.trim()} onClick={submit}>{editing === "new" ? "Add" : "Save"}</Button>
          </div>
        </div>
      )}

      {event.activities.length === 0 ? (
        <Empty>No activities yet.</Empty>
      ) : (
        <List>
          {event.activities.map((a) => (
            <div key={a.id} className="flex items-center min-h-[56px] gap-2">
              <button onClick={() => startEdit(a)} className="flex-1 min-w-0 text-left py-2 press">
                <p className="t-body truncate">
                  {a.pre_event && <span className="label text-warning border border-warning px-1.5 mr-2 align-middle">Pre-event</span>}
                  {a.name} <span className="t-foot text-ink-2">{a.kind === "social" ? "· digital" : a.kind === "song_request" ? "· poll" : "· live concert"}</span>
                </p>
                <p className="t-foot text-ink-2 truncate">{a.location ?? "No location"}{a.map_x != null || (a.kind ?? "scan") !== "scan" ? "" : " · not on map"}</p>
              </button>
              <span className="display d-sm t-num">+{a.points}</span>
              {(a.kind ?? "scan") === "scan" && (
                <button onClick={() => setPlacing(a.id)} className={`h-9 px-2 label ${placing === a.id ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}>Place</button>
              )}
              <button onClick={() => remove(a.id)} aria-label={`Delete ${a.name}`} className="w-9 h-9 flex items-center justify-center text-ink-2"><IconX size={16} /></button>
            </div>
          ))}
        </List>
      )}

      <div className="pt-2">
        <p className="label text-ink-2 mb-2">Live station</p>
        <div className="flex gap-2 flex-wrap">
          {scanActs.map((a) => (
            <button
              key={a.id}
              onClick={() => call("/api/admin/events", headers, { method: "PATCH", ...json({ id: event.id, live_activity_id: event.live_activity_id === a.id ? null : a.id }) }).then(() => onChanged())}
              className={`h-9 px-3 label ${event.live_activity_id === a.id ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}
            >
              {a.name}
            </button>
          ))}
        </div>
        <p className="t-foot text-ink-2 mt-2">Any phone tapping a band logs the live activity.</p>
      </div>
    </div>
  );
}
