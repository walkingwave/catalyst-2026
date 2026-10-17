import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LinkButton } from "@/components/ui";
import { Wordmark } from "@/components/Header";
import { IconNfc } from "@/components/icons";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return (
    <Page className="pb-8">
      <div className="pt-6">
        <Wordmark size="lg" />
      </div>
      <div className="relative aspect-[4/5] mt-6 border border-line overflow-hidden">
        <Image src="/img/our-lady-peace.jpg" alt="" fill className="object-cover photo" priority />
      </div>
      <h1 className="display d-hero mt-6">
        Tap in.
        <br />
        Rack up.
        <br />
        Cash out.
      </h1>
      <p className="t-body text-ink-2 mt-4">
        Your wristband tracks every booth you hit tonight. Claim it with a phone number and the points are yours.
      </p>
      <div className="mt-8 space-y-3">
        <LinkButton href="/login">Sign in with phone</LinkButton>
        <p className="t-foot text-ink-2 text-center flex items-center justify-center gap-1.5">
          <IconNfc size={16} /> Got a band? Tap it with your phone.
        </p>
      </div>
    </Page>
  );
}
