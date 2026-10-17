import { NextResponse } from "next/server";
import { artistFromRequest } from "@/lib/artist";

export async function POST(req: Request) {
  const artist = await artistFromRequest(req);
  if (!artist) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, artist });
}
