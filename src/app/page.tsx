import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LinkButton } from "@/components/ui";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");
  return (
    <Page className="flex flex-col justify-center min-h-dvh pb-6">
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="text-accent">●</span> ConcertConnect
      </h1>
      <p className="text-muted mt-3 text-lg">
        Tap your wristband at the show. Earn points. Get rewards.
      </p>
      <div className="mt-10 space-y-3">
        <LinkButton href="/login">Sign in with phone</LinkButton>
        <p className="text-muted text-sm text-center">Got a band? Just tap it with your phone.</p>
      </div>
    </Page>
  );
}
