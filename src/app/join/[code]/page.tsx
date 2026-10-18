import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/fan";
import { Page, Headline, LinkButton, Ticket, TicketField } from "@/components/ui";
import { Header } from "@/components/Header";

/** Ticket buyers land here from their invite. Signing in redeems it and enrolls them before they have a wristband. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.trim().toUpperCase();
  const db = createAdminClient();
  const { data: invite } = await db.from("event_invites")
    .select("code, redeemed_by, concert:concerts(id, name, artist, venue, date, doors_at, artist_id)")
    .eq("code", code).maybeSingle();
  const concert = invite && (Array.isArray(invite.concert) ? invite.concert[0] : invite.concert);

  if (!invite || !concert) {
    return (
      <Page>
        <Header />
        <Headline sub="Check the link in your ticket email.">Invite not found</Headline>
        <LinkButton href="/login" variant="outline">Sign in</LinkButton>
      </Page>
    );
  }

  const user = await getUser();
  if (user && (!invite.redeemed_by || invite.redeemed_by === user.id)) {
    if (!invite.redeemed_by) {
      // Conditional update: two people opening the same link can't both redeem it.
      await db.from("event_invites").update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() }).eq("code", code).is("redeemed_by", null);
      const { data: now } = await db.from("event_invites").select("redeemed_by").eq("code", code).maybeSingle();
      if (now?.redeemed_by !== user.id) redirect(`/join/${code}`);
    }
    const next = `/concerts/${concert.id}`;
    redirect(concert.artist_id ? `/select/${concert.artist_id}?next=${encodeURIComponent(next)}` : next);
  }

  const used = !!invite.redeemed_by;
  return (
    <Page>
      <Header />
      <Headline sub={used ? "This invite was already used by another account. Each ticket gets its own link." : "Sign in with your phone to start earning points before the show."}>
        {used ? "Invite already used" : "You're in"}
      </Headline>
      <Ticket
        rail="PRE-SHOW"
        main={
          <>
            <p className="mono-caps text-[10px] opacity-70">{formatDate(concert.date)} · {concert.venue}</p>
            <p className="display d-lg mt-1">{concert.artist}</p>
            <p className="t-sub mt-1">{concert.name}</p>
          </>
        }
        stub={<div className="grid grid-cols-2 gap-3"><TicketField label="Doors" value={concert.doors_at ?? "TBA"} /><TicketField label="Invite" value={code.slice(0, 4)} /></div>}
      />
      {!used && <div className="mt-6"><LinkButton href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}>Sign in to join</LinkButton></div>}
    </Page>
  );
}
