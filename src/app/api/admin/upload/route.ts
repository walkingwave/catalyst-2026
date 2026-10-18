import { NextResponse } from "next/server";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";
import { storeImage } from "@/lib/media";

export const runtime = "nodejs";

/** POST multipart { file, folder? } -> { url }. Stored in the public `media` bucket. */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "file required" }, { status: 400 });
  const r = await storeImage(file, String(form?.get("folder") ?? "misc"));
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status });
  return NextResponse.json({ ok: true, url: r.url });
}
