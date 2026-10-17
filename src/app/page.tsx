import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LinkButton } from "@/components/ui";
import { IconLogo, IconNfc } from "@/components/icons";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return (
    <Page className="flex flex-col justify-end min-h-dvh pb-10">
      <div className="text-accent mb-4">
        <IconLogo size={48} />
      </div>
      <h1 className="t-large-title">ConcertConnect</h1>
      <p className="t-body text-text-2 mt-2">
        Tap your wristband at the show. Earn points. Get rewards.
      </p>
      <div className="mt-8 space-y-3">
        <LinkButton href="/login">Sign in with phone</LinkButton>
        <p className="t-footnote text-text-2 text-center flex items-center justify-center gap-1.5">
          <IconNfc size={16} /> Got a band? Tap it with your phone.
        </p>
      </div>
    </Page>
  );
}
