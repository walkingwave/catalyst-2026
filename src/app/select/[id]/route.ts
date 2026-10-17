import { NextResponse } from "next/server";
import { CURRENT_COOKIE } from "@/lib/current";

/** GET /select/<artistId>?next=/dashboard  -> remembers the current event, redirects. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/dashboard";
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", req.url), { status: 303 });
  res.cookies.set(CURRENT_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
