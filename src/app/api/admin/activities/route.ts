import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

type Body = {
  id?: string;
  concert_id?: string;
  name?: string;
  points?: number;
  location?: string | null;
  kind?: "scan" | "social";
  social_network?: string | null;
  map_x?: number | null;
  map_y?: number | null;
};
const clean = (b: Body) => {
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) out.name = String(b.name).trim().slice(0, 60);
  if (b.points !== undefined) out.points = Math.max(0, Math.round(Number(b.points) || 0));
  if (b.location !== undefined) out.location = b.location ? String(b.location).trim().slice(0, 80) : null;
  if (b.kind !== undefined) out.kind = b.kind === "social" ? "social" : "scan";
  if (b.social_network !== undefined) out.social_network = b.social_network || null;
  if (b.map_x !== undefined) out.map_x = b.map_x == null ? null : Math.min(100, Math.max(0, Number(b.map_x)));
  if (b.map_y !== undefined) out.map_y = b.map_y == null ? null : Math.min(100, Math.max(0, Number(b.map_y)));
  return out;
};

/** POST create { concert_id, name, points, ... } */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const fields = clean(b);
  if (!b.concert_id || !fields.name) return NextResponse.json({ ok: false, message: "concert_id and name required" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from("activities").insert({ concert_id: b.concert_id, points: 0, ...fields }).select().single();
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, activity: data });
}

/** PATCH update { id, ...fields } */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Body;
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const fields = clean(b);
  if (fields.name === "") return NextResponse.json({ ok: false, message: "name required" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from("activities").update(fields).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, activity: data });
}

/** DELETE ?id= (scans on it are removed by cascade) */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("activities").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
