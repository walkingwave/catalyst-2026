import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

export const runtime = "nodejs";
const MAX = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

/** POST multipart { file, folder? } -> { url }. Stored in the public `media` bucket. */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "file required" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ ok: false, message: "Use a JPG, PNG, WebP, GIF or SVG" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, message: "Max 8 MB" }, { status: 400 });
  const folder = String(form?.get("folder") ?? "misc").replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "misc";
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const db = createAdminClient();
  const { error } = await db.storage.from("media").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  const { data } = db.storage.from("media").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
