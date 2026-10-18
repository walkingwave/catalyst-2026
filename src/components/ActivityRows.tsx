import { Row, Points } from "@/components/ui";
import { SocialSubmit } from "@/components/SocialSubmit";
import { SongRequestSubmit } from "@/components/SongRequestSubmit";
import { activityOpen, preEventClosesAt } from "@/lib/pre-event";
import type { Activity } from "@/lib/types";

/** Activity rows shared by the show page and Home: tap-ins, plus social posts and song requests with their answer box inline. */
export function ActivityRows({ acts, concert, doneIds, postBy, answerBy }: {
  acts: Activity[];
  concert: { date: string; doors_at?: string | null };
  doneIds: Set<string>;
  postBy: Map<string, string>;
  answerBy: Map<string, string>;
}) {
  const closesAt = preEventClosesAt(concert);
  return (
    <div className="rules">
      {acts.map((a) => {
        const open = activityOpen(a, concert);
        const title = a.pre_event ? (
          <><span className="label text-warning border border-warning px-1.5 mr-2 align-middle">Pre-event</span>{a.name}</>
        ) : a.name;
        const lock = a.pre_event ? (open ? `Before doors · closes ${closesAt.toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Closed at doors") : undefined;
        const subtitle = [lock, a.location].filter(Boolean).join(" · ") || undefined;
        if (a.kind === "social") {
          const st = postBy.get(a.id);
          return (
            <div key={a.id}>
              <Row
                title={title}
                subtitle={subtitle}
                value={st === "approved" ? "Done" : st === "pending" ? "Pending" : st === "rejected" ? "Rejected" : <>+<Points value={a.points} /></>}
                valueTone={st === "approved" ? "success" : st ? "muted" : "default"}
              />
              {!st && open && <SocialSubmit activityId={a.id} network={a.social_network ?? null} points={a.points} />}
            </div>
          );
        }
        if (a.kind === "song_request") {
          const answer = answerBy.get(a.id);
          return (
            <div key={a.id}>
              <Row
                title={title}
                subtitle={answer ? `Requested: ${answer}` : subtitle}
                value={answer ? "Done" : <>+<Points value={a.points} /></>}
                valueTone={answer ? "success" : "default"}
              />
              {!answer && open && <SongRequestSubmit activityId={a.id} points={a.points} />}
            </div>
          );
        }
        return (
          <Row
            key={a.id}
            title={title}
            subtitle={subtitle}
            value={doneIds.has(a.id) ? "Done" : <>+<Points value={a.points} /></>}
            valueTone={doneIds.has(a.id) ? "success" : "default"}
          />
        );
      })}
    </div>
  );
}
