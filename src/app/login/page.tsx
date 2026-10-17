import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page, Headline } from "@/components/ui";
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
      <Headline>Sign in</Headline>
      <LoginForm next={next ?? "/dashboard"} />
    </Page>
  );
}
