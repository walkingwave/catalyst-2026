import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";
import { storeImage } from "@/lib/media";

export const runtime = "nodejs";

/** POST multipart { file } -> { url }. Artist console image uploads (drops, messages). */
export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "file required" }, { status: 400 });
  const r = await storeImage(file, `artist-${artist.id.slice(0, 8)}`);
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  return NextResponse.json({ ok: true, url: r.url });
}
