"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Panel } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { fmtLeft, secondsLeft, type Poll } from "@/lib/polls";

/**
 * Fan-facing live poll. Vote with one tap, change it while open, watch the bars move.
 * Listens to Supabase Realtime for open/close and votes; polls every 4s as a fallback.
 */
export function PollCard({ poll: initial, artistName }: { poll: Poll; artistName?: string }) {
  const [poll, setPoll] = useState(initial);
  const [left, setLeft] = useState(() => secondsLeft(initial.closes_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useRef(createClient());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/polls/${initial.id}`, { cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; poll?: Poll };
      if (j.ok && j.poll) setPoll(j.poll);
    } catch {}
  }, [initial.id]);

  // realtime + fallback polling while live
  useEffect(() => {
    const sb = supabase.current;
    const ch = sb
      .channel(`poll-${initial.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "polls", filter: `id=eq.${initial.id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${initial.id}` }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && (poll.live || poll.status === "open")) void refresh();
    }, 4000);
    return () => {
      window.clearInterval(timer);
      void sb.removeChannel(ch);
    };
  }, [initial.id, refresh, poll.live, poll.status]);

  // countdown
  useEffect(() => {
    if (!poll.closes_at || !poll.live) return;
    const t = window.setInterval(() => {
      const s = secondsLeft(poll.closes_at);
      setLeft(s);
      if (s === 0) void refresh();
    }, 1000);
    return () => window.clearInterval(t);
  }, [poll.closes_at, poll.live, refresh]);

  async function vote(optionId: string) {
    if (busy || !poll.live) return;
    setBusy(true);
    setError(null);
    // optimistic
    setPoll((p) => {
      const prev = p.my_option_id;
      const options = p.options.map((o) => ({ ...o, votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === prev ? 1 : 0) }));
      return { ...p, my_option_id: optionId, options, total: options.reduce((n, o) => n + o.votes, 0) };
    });
    const { error } = await supabase.current.rpc("cast_vote", { p_poll_id: poll.id, p_option_id: optionId });
    setBusy(false);
    if (error) {
      setError(error.message.includes("closed") ? "This poll just closed." : error.message.includes("signed") ? "Sign in to vote." : "Could not vote.");
      void refresh();
    }
  }

  const voted = !!poll.my_option_id;
  const showBars = voted || !poll.live;
  const leader = Math.max(...poll.options.map((o) => o.votes), 0);

  return (
    <Panel className="p-4" data-testid="poll-card">
      <div className="flex items-start justify-between gap-3">
        <p className="mono-caps text-[10px] text-ink-2">
          {poll.live ? "Live poll" : "Poll closed"}{artistName ? ` · ${artistName}` : ""}
        </p>
        {poll.live && left !== null && <span className={`mono-caps text-[11px] ${left <= 10 ? "text-danger" : "text-ink-2"}`}>{fmtLeft(left)}</span>}
        {poll.live && left === null && <span className="w-2 h-2 bg-success animate-pulse mt-1" aria-label="live" />}
      </div>
      <p className="display d-md mt-2">{poll.question}</p>

      <div className="mt-4 space-y-2">
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
          const mine = o.id === poll.my_option_id;
          const top = showBars && !poll.live && o.votes === leader && leader > 0;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => vote(o.id)}
              disabled={!poll.live || busy}
              aria-pressed={mine}
              className={`relative w-full min-h-[48px] text-left overflow-hidden press disabled:opacity-100 ${mine ? "bg-invert-bg text-invert-fg" : "bg-surface"}`}
            >
              {showBars && (
                <span className={`absolute inset-y-0 left-0 ${mine ? "bg-invert-fg/20" : "bg-invert-bg/10"}`} style={{ width: `${pct}%` }} aria-hidden />
              )}
              <span className="relative flex items-center justify-between gap-3 px-4 py-3">
                <span className="t-body flex items-center gap-2">
                  {mine && <IconCheck size={16} strokeWidth={3} />}
                  {o.label}
                </span>
                {showBars && (
                  <span className={`display d-sm t-num shrink-0 ${top ? "" : "opacity-70"}`}>
                    {pct}%<span className="t-foot ml-1 normal-case font-sans">{o.votes}</span>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="t-foot text-ink-2 mt-3">
        {error ? <span className="text-danger">{error}</span> : poll.live ? (voted ? `You voted · ${poll.total} ${poll.total === 1 ? "vote" : "votes"} · tap another to change` : "Tap to vote") : `${poll.total} ${poll.total === 1 ? "vote" : "votes"}`}
      </p>
    </Panel>
  );
}
