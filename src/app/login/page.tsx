import { Page, Headline } from "@/components/ui";
import { Header } from "@/components/Header";
import { LoginForm } from "./LoginForm";

/** Signed-in fans are redirected away from here in src/proxy.ts, before this renders. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <Page>
      <Header />
      <Headline>Sign in</Headline>
      <LoginForm next={safeNext} />
    </Page>
  );
}
