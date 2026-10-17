"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Field, Headline, List, Row, Panel, SectionHeader, Badge, Empty } from "@/components/ui";
import { IconCheck, IconX, IconLock } from "@/components/icons";
import type { Artist } from "@/lib/types";

const KEY = "cc_artist_code";

type Fan = {
  user_id: string;
  name: string;
  points: number;
  rank: number;
  shows: number;
  has_phone: boolean;
  phone_hint: string | null;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
};
type Overview = {
  artist: Artist;
  stats: { fans: number; shows: number; pending_posts: number };
  top_fans: Fan[];
  concerts: { id: string; name: string; venue: string; date: string }[];
  pending_posts: {
    id: string;
    url: string;
    created_at: string;
    user: { id: string; name: string; instagram: string | null } | null;
    activity: { name: string; points: number; social_network: string | null } | null;
  }[];
  messages: { id: string; channel: string; body: string; sms_status: string | null; created_at: string; user: { name: string } | null }[];
  drops: { id: string; title: string; code: string | null; claimed_at: string | null; created_at: string; user: { name: string } | null }[];
};

type Tab = "fans" | "message" | "drop" | "social" | "log";

export function ArtistConsole() {
  const [code, setCode] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("fans");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const headers = useCallback(() => ({ "x-artist-code": code ?? "", "content-type": "application/json" }), [code]);

  const load = useCallback(async () => {
    if (!code) return;
    const r = await fetch("/api/artist/overview", { headers: headers() });
    if (r.status === 401) {
      setCode(null);
      try {
        localStorage.removeItem(KEY);
      } catch {}
      return;
    }
    setData(await r.json());
  }, [code, headers]);

  useEffect(() => {
    // Defer so the fetch (and its setState) happens outside the effect body.
    queueMicrotask(() => void load());
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    const r = await fetch("/api/artist/verify", { method: "POST", headers: { "x-artist-code": codeInput } });
    if (!r.ok) return setCodeError("Wrong access code");
    try {
      localStorage.setItem(KEY, codeInput);
    } catch {}
    setCode(codeInput);
  }

  if (!code) {
    return (
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-12">
        <div className="mb-2"><IconLock size={32} /></div>
        <Headline>Artist</Headline>
        <form onSubmit={submitCode} className="space-y-4">
          <Field label="Access code">
            <Input placeholder="Access code" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} autoFocus autoCapitalize="characters" />
          </Field>
          {codeError && <p className="t-foot text-danger">{codeError}</p>}
          <Button type="submit">Unlock</Button>
        </form>
      </main>
    );
  }

  if (!data) return <p className="t-sub text-ink-2 p-6">Loading…</p>;

  const recipients = [...selected];
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "fans", label: "Top fans" },
    { id: "message", label: "Message", count: recipients.length || undefined },
    { id: "drop", label: "Drop", count: recipients.length || undefined },
    { id: "social", label: "Social", count: data.stats.pending_posts || undefined },
    { id: "log", label: "Log" },
  ];

  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 pb-10">
      <div className="flex items-center justify-between h-14 border-b-2 border-line">
        <div>
          <p className="label text-ink-2">{data.artist.kind === "team" ? "Team console" : "Artist console"}</p>
          <h1 className="display d-md">{data.artist.name}</h1>
        </div>
        <button
          className="label underline underline-offset-4 h-11 px-2"
          onClick={() => {
            setCode(null);
            try {
              localStorage.removeItem(KEY);
            } catch {}
          }}
        >
          Lock
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <Stat label="Fans" value={data.stats.fans} />
        <Stat label="Shows" value={data.stats.shows} />
        <Stat label="To review" value={data.stats.pending_posts} />
      </div>

      <div className="flex border-2 border-line overflow-x-auto mt-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 h-11 px-3 label whitespace-nowrap border-r-2 border-line last:border-r-0 flex items-center gap-1.5 ${
              tab === t.id ? "bg-invert-bg text-invert-fg" : "text-ink-2"
            }`}
          >
            {t.label}
            {t.count ? <span className={`px-1.5 ${tab === t.id ? "bg-invert-fg text-invert-bg" : "bg-invert-bg text-invert-fg"}`}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "fans" && (
        <FansTab
          fans={data.top_fans}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onSelectTop={(n) => setSelected(new Set(data.top_fans.slice(0, n).map((f) => f.user_id)))}
          onClear={() => setSelected(new Set())}
        />
      )}

      {tab === "message" && (
        <MessageTab
          recipients={recipients}
          fans={data.top_fans}
          onSend={async (body, channel, top) => {
            const r = await fetch("/api/artist/message", {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({ body, channel, user_ids: top ? undefined : recipients, top }),
            });
            const j = await r.json();
            if (!r.ok) return j.message ?? "Failed";
            flash(`Sent to ${j.sent} fan${j.sent === 1 ? "" : "s"}${channel === "sms" && !j.live ? " (SMS simulated, Twilio off)" : ""}`);
            void load();
          }}
        />
      )}

      {tab === "drop" && (
        <DropTab
          recipients={recipients}
          onSend={async (payload) => {
            const r = await fetch("/api/artist/drop", {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({ ...payload, user_ids: payload.top ? undefined : recipients }),
            });
            const j = await r.json();
            if (!r.ok) return j.message ?? "Failed";
            flash(`Dropped to ${j.sent} fan${j.sent === 1 ? "" : "s"}`);
            void load();
          }}
        />
      )}

      {tab === "social" && (
        <SocialTab
          posts={data.pending_posts}
          onReview={async (id, status) => {
            const r = await fetch("/api/artist/social", { method: "POST", headers: headers(), body: JSON.stringify({ id, status }) });
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
            if (!r.ok || !j.ok) {
              flash(`Could not ${status === "approved" ? "approve" : "reject"}: ${j.message ?? r.status}`);
              return;
            }
            flash(status === "approved" ? "Approved, points awarded" : "Rejected");
            void load();
          }}
        />
      )}

      {tab === "log" && <LogTab messages={data.messages} drops={data.drops} />}

      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 bg-invert-bg text-invert-fg px-4 py-3 label z-50 pointer-events-none">{toast}</div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="p-3">
      <p className="label text-ink-2">{label}</p>
      <p className="display d-lg t-num mt-2">{value}</p>
    </Panel>
  );
}

function Socials({ f }: { f: Fan }) {
  const parts = [f.instagram && `ig @${f.instagram}`, f.tiktok && `tt @${f.tiktok}`, f.x_handle && `x @${f.x_handle}`].filter(Boolean);
  return <>{parts.length ? parts.join(" · ") : "No socials linked"}</>;
}

function FansTab({
  fans,
  selected,
  onToggle,
  onSelectTop,
  onClear,
}: {
  fans: Fan[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectTop: (n: number) => void;
  onClear: () => void;
}) {
  return (
    <>
      <SectionHeader action={selected.size ? <button onClick={onClear} className="underline">Clear {selected.size}</button> : "Tap to select"}>
        Top fans
      </SectionHeader>
      <div className="flex gap-2 mb-3">
        {[5, 10, 25].map((n) => (
          <button key={n} onClick={() => onSelectTop(n)} className="h-10 px-3 border-2 border-line label">
            Top {n}
          </button>
        ))}
      </div>
      {fans.length === 0 ? (
        <Panel><Empty>No fans yet.</Empty></Panel>
      ) : (
        <List>
          {fans.map((f) => (
            <Row
              key={f.user_id}
              selected={selected.has(f.user_id)}
              onClick={() => onToggle(f.user_id)}
              leading={<span className="display d-md w-8 t-num">{f.rank}</span>}
              title={
                <>
                  {f.name || "Fan"}
                  {!f.has_phone && <span className="label ml-2 opacity-60">no phone</span>}
                </>
              }
              subtitle={<><Socials f={f} /> · {f.shows} {f.shows === 1 ? "show" : "shows"}</>}
              value={f.points}
            />
          ))}
        </List>
      )}
    </>
  );
}

function MessageTab({
  recipients,
  fans,
  onSend,
}: {
  recipients: string[];
  fans: Fan[];
  onSend: (body: string, channel: "sms" | "inbox", top?: number) => Promise<string | void>;
}) {
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"sms" | "inbox">("sms");
  const [top, setTop] = useState<number | null>(recipients.length ? null : 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = top ?? recipients.length;
  const names = recipients.map((id) => fans.find((f) => f.user_id === id)?.name).filter(Boolean).slice(0, 3);

  return (
    <>
      <SectionHeader>Message</SectionHeader>
      <Panel className="p-4 space-y-4">
        <div>
          <p className="label text-ink-2 mb-2">To</p>
          <div className="flex gap-2 flex-wrap">
            {recipients.length > 0 && (
              <Pick active={top === null} onClick={() => setTop(null)}>
                {recipients.length} selected{names.length ? ` (${names.join(", ")}${recipients.length > 3 ? "…" : ""})` : ""}
              </Pick>
            )}
            {[5, 10, 25].map((n) => (
              <Pick key={n} active={top === n} onClick={() => setTop(n)}>
                Top {n}
              </Pick>
            ))}
          </div>
        </div>
        <div>
          <p className="label text-ink-2 mb-2">Channel</p>
          <div className="flex gap-2">
            <Pick active={channel === "sms"} onClick={() => setChannel("sms")}>SMS + inbox</Pick>
            <Pick active={channel === "inbox"} onClick={() => setChannel("inbox")}>Inbox only</Pick>
          </div>
        </div>
        <Field label={`Message (${body.length}/320)`}>
          <textarea
            className="w-full min-h-28 bg-surface border-2 border-line p-3 t-body outline-none focus:bg-surface-2"
            maxLength={320}
            placeholder="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        {error && <p className="t-foot text-danger">{error}</p>}
        <Button
          disabled={busy || !body.trim() || count === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await onSend(body, channel, top ?? undefined);
            setBusy(false);
            if (err) setError(err);
            else setBody("");
          }}
        >
          {busy ? "Sending…" : `Send to ${count} fan${count === 1 ? "" : "s"}`}
        </Button>
      </Panel>
    </>
  );
}

function DropTab({
  recipients,
  onSend,
}: {
  recipients: string[];
  onSend: (p: { title: string; message: string; code?: string; top?: number; notify_sms: boolean }) => Promise<string | void>;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [top, setTop] = useState<number | null>(recipients.length ? null : 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = top ?? recipients.length;
  const presets = [
    { t: "Soundcheck pass", m: "Come to soundcheck before the next show. Stage door, 4:30.", c: "SOUNDCHECK" },
    { t: "Signed poster", m: "A signed tour poster is waiting for you at the merch booth.", c: "" },
    { t: "Early tickets", m: "Presale code for the next tour date, before anyone else.", c: "EARLY" },
  ];

  return (
    <>
      <SectionHeader>Drop</SectionHeader>
      <Panel className="p-4 space-y-4">
        <div>
          <p className="label text-ink-2 mb-2">To</p>
          <div className="flex gap-2 flex-wrap">
            {recipients.length > 0 && (
              <Pick active={top === null} onClick={() => setTop(null)}>
                {recipients.length} selected
              </Pick>
            )}
            {[1, 3, 5, 10].map((n) => (
              <Pick key={n} active={top === n} onClick={() => setTop(n)}>
                Top {n}
              </Pick>
            ))}
          </div>
        </div>
        <div>
          <p className="label text-ink-2 mb-2">Quick picks</p>
          <div className="flex gap-2 flex-wrap">
            {presets.map((p) => (
              <Pick key={p.t} active={title === p.t} onClick={() => { setTitle(p.t); setMessage(p.m); setCode(p.c); }}>
                {p.t}
              </Pick>
            ))}
          </div>
        </div>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Soundcheck pass" maxLength={80} />
        </Field>
        <Field label="Message">
          <textarea
            className="w-full min-h-24 bg-surface border-2 border-line p-3 t-body outline-none focus:bg-surface-2"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
          />
        </Field>
        <Field label="Code prefix">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SOUNDCHECK" autoCapitalize="characters" />
        </Field>
        {error && <p className="t-foot text-danger">{error}</p>}
        <Button
          disabled={busy || !title.trim() || count === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await onSend({ title, message, code: code || undefined, top: top ?? undefined, notify_sms: true });
            setBusy(false);
            if (err) setError(err);
            else {
              setTitle("");
              setMessage("");
              setCode("");
            }
          }}
        >
          {busy ? "Sending…" : `Drop to ${count} fan${count === 1 ? "" : "s"}`}
        </Button>
      </Panel>
    </>
  );
}

function SocialTab({
  posts,
  onReview,
}: {
  posts: Overview["pending_posts"];
  onReview: (id: string, status: "approved" | "rejected") => Promise<void>;
}) {
  return (
    <>
      <SectionHeader>Review</SectionHeader>
      {posts.length === 0 ? (
        <Panel><Empty>Nothing to review.</Empty></Panel>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Panel key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="display d-sm">{p.user?.name || "Fan"}</p>
                  <p className="t-foot text-ink-2 mt-1">
                    {p.activity?.name} · +{p.activity?.points} pts
                    {p.user?.instagram ? ` · @${p.user.instagram}` : ""}
                  </p>
                  <a href={p.url} target="_blank" rel="noreferrer" className="t-foot underline break-all block mt-2">
                    {p.url}
                  </a>
                </div>
                <Badge>{p.activity?.social_network ?? "social"}</Badge>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="md" variant="outline" onClick={() => onReview(p.id, "rejected")}>
                  <IconX size={16} strokeWidth={3} /> Reject
                </Button>
                <Button size="md" onClick={() => onReview(p.id, "approved")}>
                  <IconCheck size={16} strokeWidth={3} /> Approve
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

function LogTab({ messages, drops }: { messages: Overview["messages"]; drops: Overview["drops"] }) {
  return (
    <>
      <SectionHeader>Drops</SectionHeader>
      {drops.length === 0 ? (
        <Panel><Empty>No drops yet.</Empty></Panel>
      ) : (
        <List>
          {drops.map((d) => (
            <Row
              key={d.id}
              title={d.title}
              subtitle={`${d.user?.name ?? "Fan"}${d.code ? ` · ${d.code}` : ""}`}
              value={d.claimed_at ? "Claimed" : "Sent"}
              valueTone={d.claimed_at ? "success" : "muted"}
            />
          ))}
        </List>
      )}
      <SectionHeader>Messages</SectionHeader>
      {messages.length === 0 ? (
        <Panel><Empty>No messages yet.</Empty></Panel>
      ) : (
        <List>
          {messages.map((m) => (
            <Row
              key={m.id}
              title={m.body}
              subtitle={`${m.user?.name ?? "Fan"} · ${m.channel}${m.sms_status ? ` · ${m.sms_status}` : ""}`}
            />
          ))}
        </List>
      )}
    </>
  );
}

function Pick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-3 border-2 border-line label ${active ? "bg-invert-bg text-invert-fg" : ""}`}
    >
      {children}
    </button>
  );
}
