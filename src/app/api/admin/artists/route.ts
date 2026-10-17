import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** POST { name, kind?, bio?, image_url?, access_code? } creates an artist/team. */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; kind?: "artist" | "team"; bio?: string; image_url?: string; access_code?: string };
  const name = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, message: "name required" }, { status: 400 });
  const slug = slugify(name);
  const db = createAdminClient();
  const { data, error } = await db
    .from("artists")
    .upsert(
      { slug, name, kind: b.kind === "team" ? "team" : "artist", bio: b.bio ?? "", image_url: b.image_url ?? null, access_code: b.access_code ?? `${slug.toUpperCase().replace(/-/g, "")}${new Date().getFullYear()}` },
      { onConflict: "slug" },
    )
    .select("id, slug, name, kind, access_code")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, message: error?.message ?? "failed" }, { status: 500 });
  return NextResponse.json({ ok: true, artist: data });
}

/** DELETE ?id=… removes an artist (rewards cascade; concerts keep running with artist_id = null). */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error, count } = await db.from("artists").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

/** PATCH { id, name?, kind?, bio?, image_url?, access_code? } */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; kind?: "artist" | "team"; bio?: string; image_url?: string | null; access_code?: string };
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const fields: Record<string, unknown> = {};
  if (b.name !== undefined) fields.name = String(b.name).trim().slice(0, 80);
  if (b.kind !== undefined) fields.kind = b.kind === "team" ? "team" : "artist";
  if (b.bio !== undefined) fields.bio = String(b.bio).trim().slice(0, 500);
  if (b.image_url !== undefined) fields.image_url = b.image_url || null;
  if (b.access_code !== undefined) fields.access_code = String(b.access_code).trim().toUpperCase().slice(0, 40) || null;
  const db = createAdminClient();
  const { data, error } = await db.from("artists").update(fields).eq("id", b.id).select("id, slug, name, kind, bio, image_url, access_code").single();
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  // keep concerts.artist (denormalised display name) in sync
  if (fields.name) await db.from("concerts").update({ artist: fields.name as string }).eq("artist_id", b.id);
  return NextResponse.json({ ok: true, artist: data });
}
