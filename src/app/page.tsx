import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LinkButton } from "@/components/ui";
import { Wordmark } from "@/components/Header";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return (
    <Page className="pb-8">
      <div className="pt-6">
        <Wordmark size="lg" />
      </div>
      <div className="relative aspect-[4/5] mt-6 -mx-4 overflow-hidden">
        <Image src="/img/our-lady-peace.jpg" alt="" fill className="object-cover photo" priority />
      </div>
      <div className="mt-6">
        <LinkButton href="/login">Sign in with phone</LinkButton>
      </div>
    </Page>
  );
}
