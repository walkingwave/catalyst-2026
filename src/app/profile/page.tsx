import { requireFan } from "@/lib/fan";
import { Page, Headline, SectionHeader, List, Row } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const { supabase, user, profile } = await requireFan("/profile");
  const { data: full } = await supabase
    .from("users")
    .select("name, phone, instagram, tiktok, x_handle")
    .eq("id", user.id)
    .maybeSingle();
  const { data: posts } = await supabase
    .from("social_posts")
    .select("id, url, status, created_at, activity:activities(name, points)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <Page>
      <Header
        right={
          <form action="/auth/signout" method="post">
            <button className="label text-ink h-11 px-2 underline underline-offset-4">Sign out</button>
          </form>
        }
      />
      <Headline kicker={full?.phone ?? ""}>
        {profile.name || "Your profile"}
      </Headline>
      <ProfileForm
        initial={{
          name: full?.name ?? "",
          instagram: full?.instagram ?? "",
          tiktok: full?.tiktok ?? "",
          x_handle: full?.x_handle ?? "",
        }}
      />

      {posts && posts.length > 0 && (
        <>
          <SectionHeader>Posts</SectionHeader>
          <List>
            {posts.map((p) => {
              const a = Array.isArray(p.activity) ? p.activity[0] : p.activity;
              return (
                <Row
                  key={p.id}
                  title={a?.name}
                  subtitle={p.url}
                  value={p.status === "approved" ? `+${a?.points}` : p.status === "rejected" ? "Rejected" : "Pending"}
                  valueTone={p.status === "approved" ? "success" : "muted"}
                />
              );
            })}
          </List>
        </>
      )}
      <Nav />
    </Page>
  );
}
