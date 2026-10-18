"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Empty, Field, Input, List, Row } from "@/components/ui";
import { IconChevron } from "@/components/icons";

type H = () => HeadersInit;
type Person = { id: string; name: string; phone: string | null; bands: string[]; demo: boolean };

// 555-0100..0199 is reserved for fiction, so generated numbers never reach a real person.
const AREAS = ["416", "647", "437", "905", "289", "365"];
export function randomDemoPhone() {
  const area = AREAS[Math.floor(Math.random() * AREAS.length)];
  return `+1${area}55501${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
}

async function call(url: string, headers: H, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...headers(), "content-type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok !== false, ...j } as { ok: boolean; message?: string; people?: Person[]; demo_available?: boolean };
}

export function PeopleTab({ eventId, headers, flash }: { eventId: string; headers: H; flash: (m: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [demoAvailable, setDemoAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);

  const load = useCallback(async () => {
    const r = await call(`/api/admin/people?concert_id=${eventId}`, headers);
    if (!r.ok) return setError(r.message ?? "Could not load people.");
    setError(null);
    setPeople(r.people ?? []);
    setDemoAvailable(r.demo_available ?? false);
  }, [eventId, headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <>
      <div className="flex items-end justify-between pt-8 pb-3">
        <h2 className="display d-sm">{people ? `${people.length} ${people.length === 1 ? "person" : "people"}` : "People"}</h2>
        <button onClick={() => setEditing("new")} disabled={!demoAvailable} className="h-9 px-3 bg-invert-bg text-invert-fg label disabled:opacity-40">+ Demo user</button>
      </div>
      {!demoAvailable && <p className="t-foot text-ink-2 mb-3">Creating demo users needs SUPABASE_ACCESS_TOKEN on the server.</p>}
      {error && <p role="alert" className="t-foot text-danger mb-3">{error}</p>}
      {!people ? <p className="t-sub text-ink-2">Loading people…</p> : people.length === 0 ? <Empty>No one has claimed a band at this event yet.</Empty> : (
        <div data-testid="people-list">
          <List>
            {people.map((p) => (
              <Row
                key={p.id}
                onClick={() => setEditing(p)}
                title={p.name || "Unnamed fan"}
                subtitle={<><span className="font-mono">{p.phone ?? "No phone"}</span> · {p.bands.length} {p.bands.length === 1 ? "band" : "bands"}</>}
                value={<Badge tone={p.demo ? "warning" : "ink"}>{p.demo ? "Demo" : "Real"}</Badge>}
                chevron
              />
            ))}
          </List>
        </div>
      )}
      <Invites eventId={eventId} headers={headers} flash={flash} />
      {editing && (
        <PersonEditor
          key={editing === "new" ? "new" : editing.id}
          person={editing === "new" ? null : editing}
          eventId={eventId}
          headers={headers}
          flash={flash}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function PersonEditor({ person, eventId, headers, flash, onClose, onSaved }: {
  person: Person | null; eventId: string; headers: H; flash: (m: string) => void; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? (person ? "" : randomDemoPhone()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const r = person
      ? await call("/api/admin/people", headers, { method: "PATCH", body: JSON.stringify({ id: person.id, name, phone }) })
      : await call("/api/admin/people", headers, { method: "POST", body: JSON.stringify({ concert_id: eventId, name, phone }) });
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Could not save.");
    flash(person ? "Saved" : `${name} signs in with ${phone} · code 123456`);
    await onSaved();
  }

  async function remove() {
    if (!person || !window.confirm(`Delete demo user "${person.name || person.phone}"?`)) return;
    setBusy(true);
    const r = await call(`/api/admin/people?id=${person.id}`, headers, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Could not delete.");
    flash("Demo user deleted");
    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-testid="person-editor">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="h-11 px-2 -ml-2 label flex items-center gap-1 press"><IconChevron size={18} className="rotate-180" /> People</button>
        {person && <Badge tone={person.demo ? "warning" : "ink"}>{person.demo ? "Demo" : "Real"}</Badge>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
        <h2 className="display d-lg">{person ? "Edit person" : "New demo user"}</h2>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus /></Field>
        <Field label="Phone">
          <div className="flex gap-2">
            <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            {(!person || person.demo) && (
              <button type="button" onClick={() => setPhone(randomDemoPhone())} className="h-14 px-4 bg-surface-2 label shrink-0">Random</button>
            )}
          </div>
        </Field>
        {!person && <p className="t-foot text-ink-2">Signs in at /login with this number and code 123456. No text is sent. Gets a band at this event.</p>}
        {person && !person.demo && <p className="t-foot text-ink-2">Real account. A new number must belong to this person; they sign in with it by SMS code.</p>}
        {person && <p className="t-foot text-ink-2">Bands: <span className="font-mono">{person.bands.join(", ")}</span></p>}
        {error && <p role="alert" className="t-foot text-danger">{error}</p>}
        <Button disabled={busy || !name.trim() || !phone.trim()} onClick={save}>{busy ? "Saving…" : person ? "Save" : "Create demo user"}</Button>
        {person?.demo && <Button variant="danger" size="md" disabled={busy} onClick={remove}>Delete demo user</Button>}
      </div>
    </div>
  );
}

type Invite = { code: string; label: string | null; redeemed_at: string | null; user: { name: string; phone: string | null } | null };

/** Single-use invite links for ticket buyers, so they can join and do pre-event activities before doors. */
function Invites({ eventId, headers, flash }: { eventId: string; headers: H; flash: (m: string) => void }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [buyers, setBuyers] = useState("");
  const [busy, setBusy] = useState(false);
  const link = (code: string) => `${window.location.origin}/join/${code}`;

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/invites?concert_id=${eventId}`, { headers: headers() });
    const j = await r.json().catch(() => ({}));
    setInvites(j.invites ?? []);
  }, [eventId, headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function create() {
    setBusy(true);
    const labels = buyers.split("\n").map((l) => l.trim()).filter(Boolean);
    const r = await fetch("/api/admin/invites", { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ concert_id: eventId, labels }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return flash(j.message ?? "Could not create invites");
    flash(`${j.created} invite${j.created === 1 ? "" : "s"} created`);
    setBuyers("");
    await load();
  }
  async function revoke(code: string) {
    const r = await fetch(`/api/admin/invites?code=${code}`, { method: "DELETE", headers: headers() });
    if (!r.ok) return flash("Could not revoke");
    await load();
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied`);
    } catch {
      flash("Copy failed");
    }
  }

  const unused = (invites ?? []).filter((i) => !i.redeemed_at);
  return (
    <div data-testid="invites">
      <div className="flex items-end justify-between pt-8 pb-3">
        <h2 className="display d-sm">{invites ? `${invites.length} ${invites.length === 1 ? "invite" : "invites"}` : "Invites"}</h2>
        {unused.length > 0 && (
          <button onClick={() => copy(unused.map((i) => `${i.label ?? ""}\t${link(i.code)}`).join("\n"), "Unused links")} className="label underline underline-offset-4">Copy unused</button>
        )}
      </div>
      <p className="t-sub text-ink-2 mb-3">One link per ticket buyer. Opening it signs them in and unlocks pre-event activities before doors.</p>
      <Field label="Ticket buyers (one name or email per line)">
        <textarea className="w-full min-h-24 bg-surface-2 p-3 t-body outline-none" value={buyers} onChange={(e) => setBuyers(e.target.value)} placeholder={"alex@example.com\nSam Lee"} />
      </Field>
      <div className="mt-3"><Button size="md" disabled={busy || !buyers.trim()} onClick={create}>{busy ? "Creating…" : "Create invite links"}</Button></div>
      {invites && invites.length > 0 && (
        <List className="mt-4">
          {invites.map((i) => (
            <Row
              key={i.code}
              title={i.label || "Ticket buyer"}
              subtitle={i.redeemed_at ? `Joined as ${i.user?.name || i.user?.phone || "fan"}` : <span className="font-mono">/join/{i.code}</span>}
              value={i.redeemed_at ? <Badge tone="success">Joined</Badge> : (
                <span className="flex gap-3">
                  <button onClick={() => copy(link(i.code), "Link")} className="label underline underline-offset-4 normal-case">Copy</button>
                  <button onClick={() => revoke(i.code)} className="label underline underline-offset-4 normal-case">Revoke</button>
                </span>
              )}
            />
          ))}
        </List>
      )}
    </div>
  );
}
