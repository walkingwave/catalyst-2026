"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Field, Headline, List, Row, Panel, SectionHeader, Badge, Empty } from "@/components/ui";
import { IconCheck, IconX, IconLock, IconChevron } from "@/components/icons";
import type { Artist } from "@/lib/types";
import { PollsTab } from "./PollsTab";
import { ImageField } from "@/components/ImageField";

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
type Template = { id: string; title: string; message: string; code_prefix: string | null; image_url?: string | null };
type Overview = {
  artist: Artist;
  sms_enabled: boolean;
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
  templates: Template[];
};
type FanDetail = {
  id: string;
  name: string;
  phone_hint: string | null;
  has_phone: boolean;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
  since: string;
  points: { earned: number; spent: number; balance: number };
  shows: { id: string; name: string; venue: string; date: string; claimed_at: string | null }[];
  scans: { name: string; points: number; at: string; show?: string }[];
  messages: { id: string; channel: string; body: string; sms_status: string | null; created_at: string }[];
  drops: { id: string; title: string; code: string | null; claimed_at: string | null; created_at: string }[];
};

type Tab = "fans" | "message" | "drop" | "polls" | "review" | "log";

type DropPayload = { title: string; message: string; code?: string; notify_sms: boolean; image_url?: string | null };
type Delivery = {
  inbox: number;
  inbox_failed: number;
  sms_sent: number;
  sms_failed: number;
  sms_skipped: number;
  status_failed: number;
};

function deliverySummary(delivery: Delivery) {
  return [
    `${delivery.sms_sent} SMS accepted`,
    delivery.sms_failed ? `${delivery.sms_failed} SMS failed` : "",
    delivery.sms_skipped ? `${delivery.sms_skipped} SMS skipped (unavailable or no phone)` : "",
    delivery.inbox_failed ? `${delivery.inbox_failed} inbox copies failed` : "",
    delivery.status_failed ? "Some results could not be saved; do not resend without checking" : "",
  ].filter(Boolean).join(" · ");
}

const socialsOf = (f: Pick<Fan, "instagram" | "tiktok" | "x_handle">) =>
  [f.instagram && `ig @${f.instagram}`, f.tiktok && `tt @${f.tiktok}`, f.x_handle && `x @${f.x_handle}`].filter(Boolean).join(" · ");

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

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
  const fanBy = new Map(data.top_fans.map((f) => [f.user_id, f]));
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "fans", label: "Fans", count: data.stats.fans || undefined },
    { id: "message", label: "Message" },
    { id: "drop", label: "Drop" },
    { id: "polls", label: "Polls" },
    { id: "review", label: "Review", count: data.stats.pending_posts || undefined },
    { id: "log", label: "Log" },
  ];

  async function sendMessage(body: string, channel: "sms" | "inbox", ids: string[], imageUrl: string | null) {
    setSendResult(null);
    const r = await fetch("/api/artist/message", { method: "POST", headers: headers(), body: JSON.stringify({ body, channel, user_ids: ids, image_url: imageUrl }) });
    const j = await r.json();
    if (!r.ok) return j.message ?? "Failed";
    setSendResult(`Sent to ${j.sent} fan${j.sent === 1 ? "" : "s"} in the inbox.${channel === "sms" ? ` ${deliverySummary(j.delivery)}` : j.delivery.inbox_failed ? ` ${j.delivery.inbox_failed} failed.` : ""}`);
    void load();
  }
  async function sendDrop(p: DropPayload, ids: string[]) {
    setSendResult(null);
    const r = await fetch("/api/artist/drop", { method: "POST", headers: headers(), body: JSON.stringify({ ...p, user_ids: ids }) });
    const j = await r.json();
    if (!r.ok) return j.message ?? "Failed";
    setSendResult(`Dropped to ${j.sent} fan${j.sent === 1 ? "" : "s"}.${j.delivery ? ` ${deliverySummary(j.delivery)}` : ""}`);
    void load();
  }

  return (
    <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 pb-28">
      <div className="flex items-center justify-between h-14 mb-2">
        <div className="min-w-0">
          <p className="label text-ink-2">{data.artist.kind === "team" ? "Team" : "Artist"}</p>
          <h1 className="display d-md truncate">{data.artist.name}</h1>
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

      <div className="hscroll flex gap-1 overflow-x-auto bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 h-10 px-3 label whitespace-nowrap flex items-center gap-1.5 ${tab === t.id ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}
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
          onSelect={setSelected}
          onOpen={(id) => { setSendResult(null); setDetailId(id); }}
        />
      )}
      {tab === "message" && (
        <MessageTab recipients={recipients} fanBy={fanBy} fans={data.top_fans} smsEnabled={data.sms_enabled} headers={headers} onSelect={setSelected} onSend={sendMessage} onPickFans={() => setTab("fans")} />
      )}
      {tab === "drop" && (
        <DropTab
          recipients={recipients}
          fanBy={fanBy}
          fans={data.top_fans}
          templates={data.templates}
          smsEnabled={data.sms_enabled}
          headers={headers}
          onSelect={setSelected}
          onSend={sendDrop}
          onPickFans={() => setTab("fans")}
          onTemplatesChanged={load}
          flash={flash}
        />
      )}
      {tab === "review" && (
        <ReviewTab
          posts={data.pending_posts}
          onReview={async (id, status) => {
            const r = await fetch("/api/artist/social", { method: "POST", headers: headers(), body: JSON.stringify({ id, status }) });
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
            if (!r.ok || !j.ok) return flash(`Could not ${status === "approved" ? "approve" : "reject"}: ${j.message ?? r.status}`);
            flash(status === "approved" ? "Approved, points awarded" : "Rejected");
            void load();
          }}
        />
      )}
      {tab === "polls" && <PollsTab headers={headers} concerts={data.concerts} flash={flash} />}
      {tab === "log" && <LogTab messages={data.messages} drops={data.drops} />}

      {sendResult && !detailId && <p role="status" className="t-foot mt-4">{sendResult}</p>}

      {/* Selection bar */}
      {selected.size > 0 && tab === "fans" && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-invert-bg text-invert-fg pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-md mx-auto flex items-center gap-2 px-4 h-16">
            <p className="label flex-1">{selected.size} selected</p>
            <button onClick={() => setSelected(new Set())} className="label opacity-70 px-2 h-10">Clear</button>
            <button onClick={() => setTab("message")} className="h-10 px-4 bg-invert-fg text-invert-bg label press">Message</button>
            <button onClick={() => setTab("drop")} className="h-10 px-4 bg-invert-fg text-invert-bg label press">Drop</button>
          </div>
        </div>
      )}

      {detailId && (
        <FanSheet
          id={detailId}
          headers={headers}
          onClose={() => setDetailId(null)}
          onMessage={async (body, channel) => sendMessage(body, channel, [detailId], null)}
          onDrop={async (p) => sendDrop(p, [detailId])}
          templates={data.templates}
          smsEnabled={data.sms_enabled}
          sendResult={sendResult}
        />
      )}

      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 bg-invert-bg text-invert-fg px-4 py-3 label z-50 pointer-events-none">{toast}</div>}
    </main>
  );
}

/* ---------------- Fans: search, checkboxes, top-N ---------------- */

function FansTab({
  fans,
  selected,
  onSelect,
  onOpen,
}: {
  fans: Fan[];
  selected: Set<string>;
  onSelect: (s: Set<string>) => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [topN, setTopN] = useState("");
  const [filter, setFilter] = useState<"all" | "phone" | "socials">("all");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return fans.filter((f) => {
      if (filter === "phone" && !f.has_phone) return false;
      if (filter === "socials" && !(f.instagram || f.tiktok || f.x_handle)) return false;
      if (!needle) return true;
      return [f.name, f.instagram, f.tiktok, f.x_handle].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [fans, q, filter]);

  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.user_id));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onSelect(n);
  };

  return (
    <>
      <div className="mt-4 space-y-2">
        <Input placeholder="Search name or @handle" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 items-center">
          <div className="hscroll flex gap-1 overflow-x-auto">
            {(["all", "phone", "socials"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`h-9 px-3 label whitespace-nowrap ${filter === f ? "bg-invert-bg text-invert-fg" : "bg-surface-2 text-ink-2"}`}>
                {f === "all" ? "All" : f === "phone" ? "Has phone" : "Has socials"}
              </button>
            ))}
          </div>
          <form
            className="ml-auto flex items-center gap-1 shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.max(0, parseInt(topN, 10) || 0);
              onSelect(new Set(fans.slice(0, n).map((f) => f.user_id)));
            }}
          >
            <span className="label text-ink-2">Top</span>
            <input className="w-14 h-9 bg-surface-2 px-2 t-sub text-center outline-none" inputMode="numeric" placeholder="10" value={topN} onChange={(e) => setTopN(e.target.value.replace(/\D/g, ""))} />
            <button type="submit" className="h-9 px-3 bg-invert-bg text-invert-fg label">Go</button>
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 pb-2">
        <h2 className="display d-sm">{visible.length} {visible.length === 1 ? "fan" : "fans"}</h2>
        <button
          onClick={() => {
            const n = new Set(selected);
            if (allVisibleSelected) visible.forEach((f) => n.delete(f.user_id));
            else visible.forEach((f) => n.add(f.user_id));
            onSelect(n);
          }}
          className="label text-ink-2"
        >
          {allVisibleSelected ? "Unselect all" : "Select all"}
        </button>
      </div>

      {visible.length === 0 ? (
        <Empty>No fans match.</Empty>
      ) : (
        <List>
          {visible.map((f) => {
            const on = selected.has(f.user_id);
            return (
              <div key={f.user_id} className="flex items-center min-h-[56px]">
                <button onClick={() => toggle(f.user_id)} aria-label={on ? "Unselect" : "Select"} aria-pressed={on} className="w-11 h-11 flex items-center justify-center shrink-0 press">
                  <span className={`w-6 h-6 flex items-center justify-center ${on ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}>{on && <IconCheck size={14} strokeWidth={3} />}</span>
                </button>
                <button onClick={() => onOpen(f.user_id)} className="flex-1 min-w-0 flex items-center gap-3 py-2 text-left press">
                  <span className="display d-md w-8 t-num text-ink-2">{f.rank}</span>
                  <span className="flex-1 min-w-0">
                    <span className="t-body block truncate">{f.name || "Fan"}</span>
                    <span className="t-foot text-ink-2 block truncate">{socialsOf(f) || "No socials"} · {f.shows} {f.shows === 1 ? "show" : "shows"}{f.has_phone ? "" : " · no phone"}</span>
                  </span>
                  <span className="display d-sm t-num">{f.points}</span>
                  <IconChevron size={16} className="text-ink-3" />
                </button>
              </div>
            );
          })}
        </List>
      )}
    </>
  );
}

/* ---------------- Recipient chips shared by Message + Drop ---------------- */

function Recipients({
  recipients,
  fanBy,
  fans,
  onSelect,
  onPickFans,
}: {
  recipients: string[];
  fanBy: Map<string, Fan>;
  fans: Fan[];
  onSelect: (s: Set<string>) => void;
  onPickFans: () => void;
}) {
  const [topN, setTopN] = useState("10");
  // Nobody picked yet: default to the top 10 so a send is one tap away.
  useEffect(() => {
    if (recipients.length === 0 && fans.length > 0) onSelect(new Set(fans.slice(0, 10).map((f) => f.user_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="label text-ink-2">To · {recipients.length} {recipients.length === 1 ? "fan" : "fans"}</p>
        <div className="flex items-center gap-1">
          <span className="label text-ink-2">Top</span>
          <input className="w-12 h-8 bg-surface-2 px-2 t-foot text-center outline-none" inputMode="numeric" value={topN} onChange={(e) => setTopN(e.target.value.replace(/\D/g, ""))} />
          <button type="button" onClick={() => onSelect(new Set(fans.slice(0, parseInt(topN, 10) || 0).map((f) => f.user_id)))} className="h-8 px-2 bg-invert-bg text-invert-fg label">Set</button>
          <button type="button" onClick={onPickFans} className="h-8 px-2 bg-surface-2 label">Pick</button>
        </div>
      </div>
      {recipients.length === 0 ? (
        <p className="t-foot text-ink-2">{fans.length === 0 ? "No fans have tapped in for this artist yet." : "Nobody picked. Set a top N or pick fans."}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {recipients.slice(0, 12).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                const n = new Set(recipients);
                n.delete(id);
                onSelect(n);
              }}
              className="h-8 pl-2 pr-1 bg-surface-2 t-foot flex items-center gap-1"
            >
              {fanBy.get(id)?.name || "Fan"} <IconX size={12} />
            </button>
          ))}
          {recipients.length > 12 && <span className="h-8 px-2 t-foot text-ink-2 flex items-center">+{recipients.length - 12} more</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Message ---------------- */

function MessageTab({
  recipients,
  fanBy,
  fans,
  smsEnabled,
  headers,
  onSelect,
  onSend,
  onPickFans,
}: {
  recipients: string[];
  fanBy: Map<string, Fan>;
  fans: Fan[];
  smsEnabled: boolean;
  headers: () => HeadersInit;
  onSelect: (s: Set<string>) => void;
  onSend: (body: string, channel: "sms" | "inbox", ids: string[], imageUrl: string | null) => Promise<string | void>;
  onPickFans: () => void;
}) {
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [channel, setChannel] = useState<"sms" | "inbox">(smsEnabled ? "sms" : "inbox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <SectionHeader>Message</SectionHeader>
      <Panel className="p-4 space-y-4">
        <Recipients recipients={recipients} fanBy={fanBy} fans={fans} onSelect={onSelect} onPickFans={onPickFans} />
        <div>
          <p className="label text-ink-2 mb-2">Channel</p>
          <div className="flex gap-1 bg-surface p-1">
            {(["sms", "inbox"] as const).map((c) => (
              <button key={c} type="button" disabled={busy || (c === "sms" && !smsEnabled)} onClick={() => setChannel(c)} className={`flex-1 h-9 label disabled:opacity-50 ${channel === c ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
                {c === "sms" ? "SMS + inbox" : "Inbox only"}
              </button>
            ))}
          </div>
          <p className="t-foot text-ink-2 mt-2">
            {smsEnabled ? "SMS is available. Every message also appears in the fan's inbox." : "SMS is unavailable. You can still send to the fan's inbox."}
          </p>
        </div>
        <Field label={`Message (${body.length}/320)`}>
          <textarea className="w-full min-h-28 bg-surface p-3 t-body outline-none" maxLength={320} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <ImageField label="Image (inbox only)" value={image} folder="messages" headers={headers} endpoint="/api/artist/upload" onChange={setImage} />
        {error && <p className="t-foot text-danger">{error}</p>}
        <Button
          disabled={busy || !body.trim() || recipients.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const err = await onSend(body, channel, recipients, image);
              if (err) setError(err);
              else {
                setBody("");
                setImage(null);
              }
            } catch {
              setError("Could not confirm the result. Check Log before trying again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : `Send to ${recipients.length} fan${recipients.length === 1 ? "" : "s"}`}
        </Button>
      </Panel>
    </>
  );
}

/* ---------------- Drop (with saved templates) ---------------- */

function DropTab({
  recipients,
  fanBy,
  fans,
  templates,
  smsEnabled,
  headers,
  onSelect,
  onSend,
  onPickFans,
  onTemplatesChanged,
  flash,
}: {
  recipients: string[];
  fanBy: Map<string, Fan>;
  fans: Fan[];
  templates: Template[];
  smsEnabled: boolean;
  headers: () => HeadersInit;
  onSelect: (s: Set<string>) => void;
  onSend: (p: DropPayload, ids: string[]) => Promise<string | void>;
  onPickFans: () => void;
  onTemplatesChanged: () => void;
  flash: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [notifySms, setNotifySms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTemplate() {
    if (!title.trim()) return;
    const r = await fetch("/api/artist/templates", { method: "POST", headers: headers(), body: JSON.stringify({ title, message, code_prefix: code, image_url: image }) });
    if (r.ok) {
      flash("Saved as a drop");
      onTemplatesChanged();
    }
  }
  async function removeTemplate(id: string) {
    await fetch(`/api/artist/templates?id=${id}`, { method: "DELETE", headers: headers() });
    onTemplatesChanged();
  }

  return (
    <>
      <SectionHeader>Drop</SectionHeader>
      <Panel className="p-4 space-y-4">
        <Recipients recipients={recipients} fanBy={fanBy} fans={fans} onSelect={onSelect} onPickFans={onPickFans} />

        <div>
          <p className="label text-ink-2 mb-2">Your drops</p>
          {templates.length === 0 ? (
            <p className="t-foot text-ink-2">None saved yet. Fill in below and tap Save.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <span key={t.id} className={`h-9 flex items-center ${title === t.title ? "bg-invert-bg text-invert-fg" : "bg-surface"}`}>
                  <button type="button" onClick={() => { setTitle(t.title); setMessage(t.message); setCode(t.code_prefix ?? ""); setImage(t.image_url ?? null); }} className="pl-3 pr-2 h-full label">
                    {t.title}
                  </button>
                  <button type="button" onClick={() => removeTemplate(t.id)} aria-label={`Delete ${t.title}`} className="pr-2 h-full opacity-60"><IconX size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={80} />
        </Field>
        <Field label="Message">
          <textarea className="w-full min-h-24 bg-surface p-3 t-body outline-none" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Message" />
        </Field>
        <ImageField label="Image" value={image} folder="drops" headers={headers} endpoint="/api/artist/upload" onChange={setImage} />
        <Field label="Code prefix">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Optional, numbered per fan" autoCapitalize="characters" />
        </Field>
        <label className="flex items-center gap-3 t-body min-h-11">
          <input type="checkbox" checked={notifySms} disabled={!smsEnabled || busy} onChange={(e) => setNotifySms(e.target.checked)} />
          Send an SMS alert
        </label>
        {!smsEnabled && <p className="t-foot text-ink-2">SMS is unavailable. The drop will appear in the fan&apos;s inbox.</p>}
        {error && <p className="t-foot text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="md" type="button" onClick={saveTemplate} disabled={!title.trim()}>Save</Button>
          <Button
            size="md"
            disabled={busy || !title.trim() || recipients.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const err = await onSend({ title, message, code: code || undefined, notify_sms: notifySms, image_url: image }, recipients);
                if (err) setError(err);
              } catch {
                setError("Could not confirm the result. Check Log before trying again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : `Drop to ${recipients.length} fan${recipients.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </Panel>
    </>
  );
}

/* ---------------- Review ---------------- */

function ReviewTab({
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
        <Empty>Nothing to review.</Empty>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Panel key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="display d-sm">{p.user?.name || "Fan"}</p>
                  <p className="t-foot text-ink-2 mt-1">
                    {p.activity?.name} · +{p.activity?.points} pts{p.user?.instagram ? ` · @${p.user.instagram}` : ""}
                  </p>
                  <a href={p.url} target="_blank" rel="noreferrer" className="t-foot underline break-all block mt-2">{p.url}</a>
                </div>
                <Badge>{p.activity?.social_network ?? "social"}</Badge>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="md" variant="outline" onClick={() => onReview(p.id, "rejected")}><IconX size={16} strokeWidth={3} /> Reject</Button>
                <Button size="md" onClick={() => onReview(p.id, "approved")}><IconCheck size={16} strokeWidth={3} /> Approve</Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Log ---------------- */

function LogTab({ messages, drops }: { messages: Overview["messages"]; drops: Overview["drops"] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const m = messages.filter((x) => !needle || x.body.toLowerCase().includes(needle) || x.user?.name?.toLowerCase().includes(needle));
  const d = drops.filter((x) => !needle || x.title.toLowerCase().includes(needle) || x.user?.name?.toLowerCase().includes(needle));
  return (
    <>
      <div className="mt-4"><Input placeholder="Search log" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <SectionHeader>Drops</SectionHeader>
      {d.length === 0 ? <Empty>No drops yet.</Empty> : (
        <List>
          {d.map((x) => (
            <Row key={x.id} title={x.title} subtitle={`${x.user?.name ?? "Fan"}${x.code ? ` · ${x.code}` : ""}`} value={x.claimed_at ? "Claimed" : "Sent"} valueTone={x.claimed_at ? "success" : "muted"} />
          ))}
        </List>
      )}
      <SectionHeader>Messages</SectionHeader>
      {m.length === 0 ? <Empty>No messages yet.</Empty> : (
        <List>
          {m.map((x) => (
            <Row key={x.id} title={x.body} subtitle={`${x.user?.name ?? "Fan"} · ${x.channel}${x.sms_status ? ` · ${x.sms_status === "sent" ? "SMS accepted" : x.sms_status}` : ""}`} />
          ))}
        </List>
      )}
    </>
  );
}

/* ---------------- Fan sheet: one person ---------------- */

function FanSheet({
  id,
  headers,
  templates,
  smsEnabled,
  sendResult,
  onClose,
  onMessage,
  onDrop,
}: {
  id: string;
  headers: () => HeadersInit;
  templates: Template[];
  smsEnabled: boolean;
  sendResult: string | null;
  onClose: () => void;
  onMessage: (body: string, channel: "sms" | "inbox") => Promise<string | void>;
  onDrop: (p: DropPayload) => Promise<string | void>;
}) {
  const [fan, setFan] = useState<FanDetail | null>(null);
  const [mode, setMode] = useState<"info" | "message" | "drop">("info");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [notifySms, setNotifySms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/artist/fan?id=${id}`, { headers: headers() });
    const j = await r.json();
    setFan(j.fan ?? null);
  }, [id, headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function sendDirectMessage(channel: "sms" | "inbox") {
    setBusy(true);
    setErr(null);
    try {
      const error = await onMessage(body, channel);
      if (error) setErr(error);
      else { setBody(""); void load(); }
    } catch {
      setErr("Could not confirm the result. Check History before trying again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendDirectDrop() {
    setBusy(true);
    setErr(null);
    try {
      const error = await onDrop({ title, message: msg, code: code || undefined, notify_sms: notifySms, image_url: image });
      if (error) setErr(error);
      else { setTitle(""); setMsg(""); setCode(""); setMode("info"); void load(); }
    } catch {
      setErr("Could not confirm the result. Check History before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-testid="fan-sheet">
      <div className="flex items-center justify-between px-4 h-14 pt-[env(safe-area-inset-top)]">
        <button onClick={onClose} className="h-11 px-2 -ml-2 label flex items-center gap-1 press"><IconChevron size={18} className="rotate-180" /> Fans</button>
        {fan && <span className="display d-sm t-num">{fan.points.balance} pts</span>}
      </div>
      {!fan ? (
        <p className="t-sub text-ink-2 p-6">Loading…</p>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          <h2 className="display d-xl">{fan.name || "Fan"}</h2>
          <p className="t-foot text-ink-2 mt-1">
            {socialsOf(fan) || "No socials"}{fan.phone_hint ? ` · ${fan.phone_hint}` : " · no phone"}
          </p>

          <div className="flex gap-1 bg-surface-2 p-1 mt-4">
            {(["info", "message", "drop"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 h-10 label ${mode === m ? "bg-invert-bg text-invert-fg" : "text-ink-2"}`}>
                {m === "info" ? "History" : m === "message" ? "Message" : "Drop"}
              </button>
            ))}
          </div>

          {mode === "info" && (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Panel className="p-3"><p className="label text-ink-2">Earned</p><p className="display d-lg t-num mt-1">{fan.points.earned}</p></Panel>
                <Panel className="p-3"><p className="label text-ink-2">Spent</p><p className="display d-lg t-num mt-1">{fan.points.spent}</p></Panel>
                <Panel className="p-3"><p className="label text-ink-2">Shows</p><p className="display d-lg t-num mt-1">{fan.shows.length}</p></Panel>
              </div>
              <SectionHeader>Taps</SectionHeader>
              {fan.scans.length === 0 ? <Empty>No taps yet.</Empty> : (
                <List>{fan.scans.map((s, i) => <Row key={i} title={s.name} subtitle={`${s.show ?? ""} · ${new Date(s.at).toLocaleString()}`} value={`+${s.points}`} />)}</List>
              )}
              <SectionHeader>Drops sent</SectionHeader>
              {fan.drops.length === 0 ? <Empty>None yet.</Empty> : (
                <List>{fan.drops.map((d) => <Row key={d.id} title={d.title} subtitle={d.code ?? undefined} value={d.claimed_at ? "Claimed" : "Sent"} valueTone={d.claimed_at ? "success" : "muted"} />)}</List>
              )}
              <SectionHeader>Messages sent</SectionHeader>
              {fan.messages.length === 0 ? <Empty>None yet.</Empty> : (
                <List>{fan.messages.map((m) => <Row key={m.id} title={m.body} subtitle={`${m.channel}${m.sms_status ? ` · ${m.sms_status === "sent" ? "SMS accepted" : m.sms_status}` : ""} · ${new Date(m.created_at).toLocaleString()}`} />)}</List>
              )}
            </>
          )}

          {mode === "message" && (
            <div className="mt-4 space-y-3">
              <textarea className="w-full min-h-28 bg-surface-2 p-3 t-body outline-none" maxLength={320} placeholder={`Message ${fan.name || "this fan"}`} value={body} onChange={(e) => setBody(e.target.value)} />
              {err && <p className="t-foot text-danger">{err}</p>}
              <div className="flex gap-2">
                <Button size="md" variant="outline" disabled={busy || !body.trim()} onClick={() => sendDirectMessage("inbox")}>Inbox</Button>
                <Button size="md" disabled={busy || !body.trim() || !fan.has_phone || !smsEnabled} onClick={() => sendDirectMessage("sms")}>SMS + inbox</Button>
              </div>
              {!smsEnabled && <p className="t-foot text-ink-2">SMS is unavailable. You can still send to the fan&apos;s inbox.</p>}
            </div>
          )}

          {mode === "drop" && (
            <div className="mt-4 space-y-3">
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button key={t.id} type="button" onClick={() => { setTitle(t.title); setMsg(t.message); setCode(t.code_prefix ?? ""); setImage(t.image_url ?? null); }} className={`h-9 px-3 label ${title === t.title ? "bg-invert-bg text-invert-fg" : "bg-surface-2"}`}>{t.title}</button>
                  ))}
                </div>
              )}
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={80} />
              <textarea className="w-full min-h-20 bg-surface-2 p-3 t-body outline-none" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} placeholder="Message" />
              <ImageField label="Image" value={image} folder="drops" headers={headers} endpoint="/api/artist/upload" onChange={setImage} />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optional)" autoCapitalize="characters" />
              <label className="flex items-center gap-3 t-body min-h-11">
                <input type="checkbox" checked={notifySms} disabled={!smsEnabled || !fan.has_phone || busy} onChange={(e) => setNotifySms(e.target.checked)} />
                Send an SMS alert
              </label>
              {err && <p className="t-foot text-danger">{err}</p>}
              <Button disabled={busy || !title.trim()} onClick={sendDirectDrop}>
                Drop to {fan.name || "fan"}
              </Button>
            </div>
          )}
          {sendResult && <p role="status" className="t-foot mt-4">{sendResult}</p>}
        </div>
      )}
    </div>
  );
}
