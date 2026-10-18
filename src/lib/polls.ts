export type PollOption = { id: string; label: string; position: number; votes: number };
export type Poll = {
  id: string;
  artist_id: string;
  concert_id: string | null;
  question: string;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
  options: PollOption[];
  total: number;
  /** open and timer (if any) not expired */
  live: boolean;
  /** the caller's choice, when known */
  my_option_id?: string | null;
};

export const isLive = (p: { status: string; closes_at: string | null }) =>
  p.status === "open" && (!p.closes_at || Date.parse(p.closes_at) > Date.now());

type RawPoll = { id: string; artist_id: string; concert_id: string | null; question: string; status: Poll["status"]; opened_at: string | null; closes_at: string | null; closed_at: string | null; created_at: string };
type RawResult = { poll_id: string; option_id: string; label: string; position: number; votes: number };

/** Join polls with aggregate results into the shape both consoles and fans use. */
export function assemble(polls: RawPoll[], results: RawResult[], myVotes: { poll_id: string; option_id: string }[] = []): Poll[] {
  const by = new Map<string, PollOption[]>();
  for (const r of results) {
    const list = by.get(r.poll_id) ?? [];
    list.push({ id: r.option_id, label: r.label, position: r.position, votes: r.votes });
    by.set(r.poll_id, list);
  }
  const mine = new Map(myVotes.map((v) => [v.poll_id, v.option_id]));
  return polls.map((p) => {
    const options = (by.get(p.id) ?? []).sort((a, b) => a.position - b.position);
    return { ...p, options, total: options.reduce((n, o) => n + o.votes, 0), live: isLive(p), my_option_id: mine.get(p.id) ?? null };
  });
}

/** Seconds left on a timer, or null when there is none. */
export const secondsLeft = (closes_at: string | null) => (closes_at ? Math.max(0, Math.round((Date.parse(closes_at) - Date.now()) / 1000)) : null);

export const fmtLeft = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`);
