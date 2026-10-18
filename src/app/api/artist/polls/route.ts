import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { assemble } from "@/lib/polls";

/** Close any open polls whose timer ran out (called on every artist read). */
async function sweep(db: ReturnType<typeof createAdminClient>, artistId: string) {
  await db
    .from("polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("artist_id", artistId)
    .eq("status", "open")
    .lt("closes_at", new Date().toISOString());
}

/** GET: this artist's polls with live results. */
export async function GET(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();
  await sweep(db, artist.id);
  const { data: polls } = await db.from("polls").select("*").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(50);
  const ids = (polls ?? []).map((p) => p.id);
  const { data: results } = ids.length ? await db.from("poll_results").select("*").in("poll_id", ids) : { data: [] };
  return NextResponse.json({ ok: true, polls: assemble(polls ?? [], results ?? []) });
}

/** POST: create. { question, options: string[], concert_id?, duration_min?, open?: boolean } */
export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { question?: string; options?: string[]; concert_id?: string | null; duration_min?: number | null; open?: boolean };
  const question = (b.question ?? "").trim().slice(0, 140);
  const options = (b.options ?? []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean);
  if (!question) return NextResponse.json({ ok: false, message: "Ask a question" }, { status: 400 });
  if (options.length < 2 || options.length > 6) return NextResponse.json({ ok: false, message: "Give 2 to 6 options" }, { status: 400 });
  const minutes = b.duration_min ? Math.min(240, Math.max(1, Math.round(Number(b.duration_min)))) : null;

  const db = createAdminClient();
  const now = new Date();
  const open = !!b.open;
  const { data: poll, error } = await db
    .from("polls")
    .insert({
      artist_id: artist.id,
      concert_id: b.concert_id || null,
      question,
      status: open ? "open" : "draft",
      opened_at: open ? now.toISOString() : null,
      closes_at: open && minutes ? new Date(now.getTime() + minutes * 60000).toISOString() : null,
    })
    .select()
    .single();
  if (error || !poll) return NextResponse.json({ ok: false, message: error?.message ?? "Create failed" }, { status: 500 });
  const { error: oErr } = await db.from("poll_options").insert(options.map((label, position) => ({ poll_id: poll.id, label, position })));
  if (oErr) return NextResponse.json({ ok: false, message: oErr.message }, { status: 500 });
  if (open) await announce(db, artist.id, artist.name, question);
  return NextResponse.json({ ok: true, poll_id: poll.id, duration_min: minutes });
}

/** PATCH: { id, action: "open" | "close" | "reopen", duration_min? } */
export async function PATCH(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; duration_min?: number | null };
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { data: poll } = await db.from("polls").select("id, question, status").eq("id", b.id).eq("artist_id", artist.id).maybeSingle();
  if (!poll) return NextResponse.json({ ok: false, message: "Poll not found" }, { status: 404 });
  const now = new Date();
  const minutes = b.duration_min ? Math.min(240, Math.max(1, Math.round(Number(b.duration_min)))) : null;
  let patch: Record<string, unknown>;
  switch (b.action) {
    case "open":
    case "reopen":
      patch = { status: "open", opened_at: now.toISOString(), closed_at: null, closes_at: minutes ? new Date(now.getTime() + minutes * 60000).toISOString() : null };
      break;
    case "close":
      patch = { status: "closed", closed_at: now.toISOString() };
      break;
    default:
      return NextResponse.json({ ok: false, message: "Unknown action" }, { status: 400 });
  }
  const { error } = await db.from("polls").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (b.action !== "close" && poll.status !== "open") await announce(db, artist.id, artist.name, poll.question);
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= */
export async function DELETE(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("polls").delete().eq("id", id).eq("artist_id", artist.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Inbox nudge to every fan with points for this artist. */
async function announce(db: ReturnType<typeof createAdminClient>, artistId: string, artistName: string, question: string) {
  const { data: fans } = await db.from("leaderboard_artist").select("user_id").eq("artist_id", artistId).limit(500);
  const rows = (fans ?? []).map((f) => ({ artist_id: artistId, user_id: f.user_id, channel: "inbox" as const, body: `New poll from ${artistName}: ${question}` }));
  if (rows.length) await db.from("messages").insert(rows);
}
