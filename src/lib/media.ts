import { createAdminClient } from "@/lib/supabase/admin";

const MAX = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

/** Validate and store an image in the public `media` bucket. Shared by admin and artist uploads. */
export async function storeImage(file: File, folder: string): Promise<{ ok: true; url: string } | { ok: false; status: number; message: string }> {
  if (!TYPES.has(file.type)) return { ok: false, status: 400, message: "Use a JPG, PNG, WebP, GIF or SVG" };
  if (file.size > MAX) return { ok: false, status: 400, message: "Max 8 MB" };
  const safe = folder.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "misc";
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${safe}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const db = createAdminClient();
  const { error } = await db.storage.from("media").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, url: db.storage.from("media").getPublicUrl(path).data.publicUrl };
}

/** Only keep image URLs that point at our own public bucket. */
export function cleanImage(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return u.startsWith(`${base}/storage/v1/object/public/media/`) ? u.slice(0, 500) : null;
}
