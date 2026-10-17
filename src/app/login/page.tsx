import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, LargeTitle } from "@/components/ui";
import { Header } from "@/components/Header";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getUser();
  const { next } = await searchParams;
  if (user) redirect(next ?? "/dashboard");
  return (
    <Page>
      <Header />
      <LargeTitle sub="We'll text you a one-time code.">Sign in</LargeTitle>
      <LoginForm next={next ?? "/dashboard"} />
    </Page>
  );
}
