import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assemble } from "@/lib/polls";

/** Fan-side: one published poll with live results and the caller's vote. Public read, no secrets. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: poll }, { data: results }, { data: { user } }] = await Promise.all([
    supabase.from("polls").select("*").eq("id", id).maybeSingle(),
    supabase.from("poll_results").select("*").eq("poll_id", id),
    supabase.auth.getUser(),
  ]);
  if (!poll) return NextResponse.json({ ok: false, message: "Poll not found" }, { status: 404 });
  const { data: mine } = user ? await supabase.from("poll_votes").select("poll_id, option_id").eq("poll_id", id) : { data: [] };
  const [p] = assemble([poll], results ?? [], mine ?? []);
  return NextResponse.json({ ok: true, poll: p }, { headers: { "cache-control": "no-store" } });
}
