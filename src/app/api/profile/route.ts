import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const handle = (v: unknown) =>
  typeof v === "string" ? v.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 40) || null : null;

/** Fan updates name + social handles. RLS: users can update own row. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, string | null> = {
    instagram: handle(b.instagram),
    tiktok: handle(b.tiktok),
    x_handle: handle(b.x_handle),
  };
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 60);
  const { error } = await supabase.from("users").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
