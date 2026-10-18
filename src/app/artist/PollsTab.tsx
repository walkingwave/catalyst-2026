"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Field, Panel, Empty, SkeletonRows } from "@/components/ui";
import { IconX, IconCheck } from "@/components/icons";
import { fmtLeft, secondsLeft, type Poll } from "@/lib/polls";

/** Artist side: create a poll, open/close it (optionally on a timer), watch votes land. */
export function PollsTab({ headers, concerts, flash }: { headers: () => HeadersInit; concerts: { id: string; name: string; date: string }[]; flash: (m: string) => void }) {
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [minutes, setMinutes] = useState("");
  const [concertId, setConcertId] = useState(concerts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/artist/polls", { headers: headers(), cache: "no-store" });
    const j = (await r.json()) as { polls?: Poll[] };
    setPolls(j.polls ?? []);
  }, [headers]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  // live refresh while anything is open; 1s tick drives countdowns
  const anyLive = !!polls?.some((p) => p.live);
  useEffect(() => {
    const t = window.setInterval(() => {
      setTick((n) => n + 1);
      if (anyLive && document.visibilityState === "visible") void load();
    }, anyLive ? 2000 : 15000);
    return () => window.clearInterval(t);
  }, [anyLive, load]);
  void tick;

  async function create(open: boolean) {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/artist/polls", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ question: q, options: opts, concert_id: concertId || null, duration_min: minutes ? Number(minutes) : null, open }),
    });
    const j = (await r.json()) as { ok: boolean; message?: string };
    setBusy(false);
    if (!r.ok || !j.ok) return setErr(j.message ?? "Could not create");
    flash(open ? "Poll is live" : "Poll saved");
    setComposing(false);
    setQ("");
    setOpts(["", ""]);
    setMinutes("");
    void load();
  }
  async function act(id: string, action: "open" | "close" | "reopen", duration_min?: number | null) {
    const r = await fetch("/api/artist/polls", { method: "PATCH", headers: headers(), body: JSON.stringify({ id, action, duration_min }) });
    const j = (await r.json()) as { ok: boolean; message?: string };
    if (!r.ok || !j.ok) return flash(j.message ?? "Failed");
    flash(action === "close" ? "Poll closed" : "Poll is live");
    void load();
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this poll and its votes?")) return;
    await fetch(`/api/artist/polls?id=${id}`, { method: "DELETE", headers: headers() });
    void load();
  }

  const valid = q.trim().length > 0 && opts.filter((o) => o.trim()).length >= 2;

  return (
    <>
      <div className="flex items-center justify-between pt-6 pb-2">
        <h2 className="display d-sm">Polls</h2>
        <button onClick={() => setComposing((c) => !c)} className="h-9 px-3 bg-invert-bg text-invert-fg label">{composing ? "Close" : "+ New poll"}</button>
      </div>

      {composing && (
        <Panel className="p-4 space-y-4 mb-4" data-testid="poll-composer">
          <Field label="Question">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What song next?" maxLength={140} autoFocus />
          </Field>
          <div>
            <p className="label text-ink-2 mb-2">Options</p>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} maxLength={60} />
                  {opts.length > 2 && (
                    <button type="button" onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="w-12 h-14 bg-surface flex items-center justify-center shrink-0"><IconX size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            {opts.length < 6 && (
              <button type="button" onClick={() => setOpts([...opts, ""])} className="mt-2 h-10 px-3 bg-surface label">+ Add option</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timer (minutes, optional)">
              <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="No timer" />
            </Field>
            <Field label="Show">
              <select className="w-full h-14 bg-surface px-3 t-sub" value={concertId} onChange={(e) => setConcertId(e.target.value)}>
                <option value="">All fans</option>
                {concerts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          {err && <p className="t-foot text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button size="md" variant="outline" disabled={busy || !valid} onClick={() => create(false)}>Save draft</Button>
            <Button size="md" disabled={busy || !valid} onClick={() => create(true)}>{busy ? "…" : "Open now"}</Button>
          </div>
        </Panel>
      )}

      {polls === null ? (
        <SkeletonRows count={3} />
      ) : polls.length === 0 ? (
        <Empty>No polls yet.</Empty>
      ) : (
        <div className="space-y-3">
          {polls.map((p) => <PollRow key={p.id} poll={p} onAct={act} onDelete={remove} />)}
        </div>
      )}
    </>
  );
}

function PollRow({ poll, onAct, onDelete }: { poll: Poll; onAct: (id: string, a: "open" | "close" | "reopen", m?: number | null) => Promise<void>; onDelete: (id: string) => void }) {
  const [minutes, setMinutes] = useState("");
  const left = secondsLeft(poll.closes_at);
  const leader = Math.max(...poll.options.map((o) => o.votes), 0);
  return (
    <Panel className={`p-4 ${poll.live ? "ring-2 ring-success" : ""}`} data-testid="poll-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono-caps text-[10px] text-ink-2">
            {poll.live ? "Live" : poll.status === "draft" ? "Draft" : "Closed"} · {poll.total} {poll.total === 1 ? "vote" : "votes"}
            {poll.live && left !== null ? ` · ${fmtLeft(left)} left` : ""}
          </p>
          <p className="display d-md mt-1">{poll.question}</p>
        </div>
        {poll.live && <span className="w-2.5 h-2.5 bg-success animate-pulse mt-1 shrink-0" aria-label="live" />}
      </div>

      <div className="mt-3 space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
          const top = !poll.live && poll.total > 0 && o.votes === leader;
          return (
            <div key={o.id} className="relative overflow-hidden bg-surface">
              <div className="absolute inset-y-0 left-0 bg-invert-bg/15" style={{ width: `${pct}%` }} />
              <div className="relative flex items-center justify-between px-3 py-2">
                <span className="t-sub flex items-center gap-1.5">{top && <IconCheck size={14} strokeWidth={3} />}{o.label}</span>
                <span className="display d-sm t-num">{pct}%<span className="t-foot ml-1 normal-case font-sans text-ink-2">{o.votes}</span></span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-4">
        {poll.live ? (
          <Button size="md" variant="danger" onClick={() => onAct(poll.id, "close")}>Close poll</Button>
        ) : (
          <>
            <input className="w-20 h-12 bg-surface px-3 t-sub text-center outline-none" inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Timer minutes" />
            <Button size="md" onClick={() => onAct(poll.id, poll.status === "draft" ? "open" : "reopen", minutes ? Number(minutes) : null)}>
              {poll.status === "draft" ? "Open" : "Reopen"}
            </Button>
          </>
        )}
        <button onClick={() => onDelete(poll.id)} aria-label="Delete poll" className="w-12 h-12 flex items-center justify-center text-ink-2 shrink-0"><IconX size={16} /></button>
      </div>
    </Panel>
  );
}
