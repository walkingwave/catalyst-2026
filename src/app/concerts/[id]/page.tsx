import Image from "next/image";
import { notFound } from "next/navigation";
import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, List, Row, SectionHeader, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { VenueMap } from "@/components/VenueMap";
import { SocialSubmit } from "@/components/SocialSubmit";
import { SongRequestSubmit } from "@/components/SongRequestSubmit";
import { activityOpen, preEventClosesAt } from "@/lib/pre-event";
import { PollCard } from "@/components/PollCard";
import { fanPolls } from "@/lib/fan";
import type { Activity, Concert } from "@/lib/types";

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireFan(`/concerts/${id}`);

  const [{ data: concert }, { data: activities }, scans, { data: posts }, { data: answers }] = await Promise.all([
    supabase.from("concerts").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*").eq("concert_id", id).order("points"),
    fanScans(supabase),
    supabase.from("social_posts").select("activity_id, status").eq("user_id", user.id),
    supabase.from("activity_completions").select("activity_id, response").eq("user_id", user.id),
  ]);
  if (!concert) notFound();
  const c = concert as Concert;
  const polls = c.artist_id ? await fanPolls(supabase, c.artist_id, 1) : [];
  // Pre-event tasks first so fans with only an invite see what they can do now.
  const acts = ((activities ?? []) as Activity[]).sort((a, b) => Number(!!b.pre_event) - Number(!!a.pre_event));
  const answerBy = new Map((answers ?? []).map((x) => [x.activity_id, x.response]));
  const closesAt = preEventClosesAt(c);
  const mine = scans.filter((s) => s.activity?.concert_id === id);
  const doneNames = new Set(mine.map((s) => s.activity?.name));
  const doneIds = new Set(acts.filter((a) => doneNames.has(a.name)).map((a) => a.id));
  const postBy = new Map((posts ?? []).map((p) => [p.activity_id, p.status]));
  for (const [aid, st] of postBy) if (st === "approved") doneIds.add(aid);
  for (const aid of answerBy.keys()) doneIds.add(aid);
  const scanActs = acts.filter((a) => (a.kind ?? "scan") === "scan");
  const remoteEarned = acts.filter((a) => (a.kind === "social" && postBy.get(a.id) === "approved") || answerBy.has(a.id)).reduce((n, a) => n + a.points, 0);
  const earned = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0) + remoteEarned;
  const possible = acts.reduce((n, a) => n + a.points, 0);

  return (
    <Page>
      <Header />
      <div className="relative aspect-[4/5] mt-2 -mx-4 overflow-hidden">
        {c.image_url && <Image src={c.image_url} alt={c.artist} fill className="object-cover photo" priority />}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent text-white">
          <p className="label text-white/70">{formatDate(c.date)} · {c.venue}</p>
          <h1 className="display d-hero mt-1">{c.artist}</h1>
        </div>
      </div>
      <p className="t-body text-ink-2 mt-4">{c.description}</p>

      {polls.length > 0 && (
        <>
          <SectionHeader>{polls.some((p) => p.live) ? "Live poll" : "Poll"}</SectionHeader>
          <div className="space-y-3">{polls.map((p) => <PollCard key={p.id} poll={p} />)}</div>
        </>
      )}

      <SectionHeader>Details</SectionHeader>
      <List>
        <Row title="Show" value={<span className="t-sub normal-case font-sans font-medium">{c.name}</span>} />
        <Row title="Venue" value={<span className="t-sub normal-case font-sans font-medium">{c.venue}</span>} />
        {c.doors_at && <Row title="Doors" value={<span className="t-sub normal-case font-sans font-medium">{c.doors_at}</span>} />}
        {c.address && <Row title="Address" value={<span className="t-sub normal-case font-sans font-medium">{c.address}</span>} />}
      </List>

      <SectionHeader action={`${earned} / ${possible} pts`}>Venue map</SectionHeader>
      <VenueMap activities={scanActs} done={doneIds} venue={c.venue} imageUrl={c.map_image_url} />

      {c.venue_image_url && (
        <div className="relative aspect-[16/9] mt-3 -mx-4 overflow-hidden">
          <Image src={c.venue_image_url} alt={c.venue} fill className="object-cover photo" />
          <p className="absolute left-3 bottom-3 label text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {c.venue}{c.address ? ` · ${c.address}` : ""}
          </p>
        </div>
      )}

      {/* Every activity lives here: tap-ins, plus social posts and song requests with their answer box inline. */}
      <SectionHeader>Activities</SectionHeader>
      <div className="rules">
        {acts.map((a) => {
          const open = activityOpen(a, c);
          const title = a.pre_event ? (
            <><span className="label bg-warning text-black px-1.5 mr-2 align-middle">Pre-event</span>{a.name}</>
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
      <Nav />
    </Page>
  );
}
