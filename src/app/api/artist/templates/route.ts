import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanImage } from "@/lib/media";

/** Saved drop templates for this artist. GET list, POST create, DELETE ?id= */
export async function GET(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createAdminClient();
  const { data } = await db.from("drop_templates").select("*").eq("artist_id", artist.id).order("created_at");
  return NextResponse.json({ ok: true, templates: data ?? [] });
}

export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; message?: string; code_prefix?: string; image_url?: string | null };
  const title = (b.title ?? "").trim().slice(0, 80);
  if (!title) return NextResponse.json({ ok: false, message: "Title is empty" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db
    .from("drop_templates")
    .insert({ artist_id: artist.id, title, message: (b.message ?? "").trim().slice(0, 500), code_prefix: b.code_prefix?.trim().toUpperCase() || null, image_url: cleanImage(b.image_url) })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("drop_templates").delete().eq("id", id).eq("artist_id", artist.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
