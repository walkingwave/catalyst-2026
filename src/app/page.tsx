import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LinkButton } from "@/components/ui";
import { Wordmark } from "@/components/Header";
import { IconNfc, IconTrophy, IconGift } from "@/components/icons";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return (
    <Page className="min-h-dvh flex flex-col pb-8">
      <div className="pt-6">
        <Wordmark size="lg" />
      </div>
      <div className="flex-1 flex flex-col justify-center py-10">
        <h1 className="display d-hero">Your wristband, your points.</h1>
        <p className="t-body text-ink-2 mt-4">
          Tap your band at the door, the merch stand, the photo wall. Points build up with each artist or team, and they get you rewards and drops.
        </p>
        <ul className="mt-8 space-y-4">
          <li className="flex items-center gap-3"><IconNfc size={22} /><span className="t-body">Tap in at stations around the venue</span></li>
          <li className="flex items-center gap-3"><IconTrophy size={22} /><span className="t-body">Climb the board for the show and the artist</span></li>
          <li className="flex items-center gap-3"><IconGift size={22} /><span className="t-body">Spend points on merch, codes and drops</span></li>
        </ul>
      </div>
      <div className="space-y-3">
        <LinkButton href="/login">Sign in with phone</LinkButton>
        <p className="t-foot text-ink-2 text-center">Got a band? Tap it with your phone.</p>
      </div>
    </Page>
  );
}
