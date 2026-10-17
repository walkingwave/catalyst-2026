import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Page } from "@/components/ui";
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
      <h1 className="text-3xl font-bold mb-1">Sign in</h1>
      <p className="text-muted mb-6">We&apos;ll text you a code.</p>
      <LoginForm next={next ?? "/dashboard"} />
    </Page>
  );
}
