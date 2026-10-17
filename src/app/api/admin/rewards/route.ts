import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

/** POST { artist_id, name, description?, cost, type, stock, codes?: string[] } */
export async function POST(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    artist_id?: string;
    name?: string;
    description?: string;
    cost?: number;
    type?: "merch" | "discount_code";
    stock?: number;
    codes?: string[];
  };
  const name = (b.name ?? "").trim();
  if (!b.artist_id || !name || b.cost == null) return NextResponse.json({ ok: false, message: "artist_id, name, cost required" }, { status: 400 });
  const type = b.type === "discount_code" ? "discount_code" : "merch";
  const codes = (b.codes ?? []).map((c) => c.trim()).filter(Boolean);
  const stock = type === "discount_code" ? codes.length : Math.max(0, Math.round(Number(b.stock) || 0));
  const db = createAdminClient();
  const { data: reward, error } = await db
    .from("rewards")
    .insert({ artist_id: b.artist_id, name, description: b.description ?? "", cost: Math.max(0, Math.round(Number(b.cost))), type, stock })
    .select()
    .single();
  if (error || !reward) return NextResponse.json({ ok: false, message: error?.message ?? "failed" }, { status: 500 });
  if (codes.length) {
    const { error: cErr } = await db.from("reward_codes").insert(codes.map((code) => ({ reward_id: reward.id, code })));
    if (cErr) return NextResponse.json({ ok: false, message: cErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reward });
}

/** GET ?artist_id= -> rewards with code counts */
export async function GET(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const artist = new URL(req.url).searchParams.get("artist_id");
  const db = createAdminClient();
  let q = db.from("rewards").select("*").order("cost");
  if (artist) q = q.eq("artist_id", artist);
  const { data: rewards } = await q;
  const ids = (rewards ?? []).map((r) => r.id);
  const { data: codes } = ids.length ? await db.from("reward_codes").select("reward_id, redeemed_by").in("reward_id", ids) : { data: [] };
  const counts = new Map<string, { total: number; free: number }>();
  for (const c of codes ?? []) {
    const e = counts.get(c.reward_id) ?? { total: 0, free: 0 };
    e.total++;
    if (!c.redeemed_by) e.free++;
    counts.set(c.reward_id, e);
  }
  return NextResponse.json({ ok: true, rewards: (rewards ?? []).map((r) => ({ ...r, codes: counts.get(r.id) ?? { total: 0, free: 0 } })) });
}

/** PATCH { id, name?, description?, cost?, stock?, add_codes?: string[] } */
export async function PATCH(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; name?: string; description?: string; cost?: number; stock?: number; add_codes?: string[] };
  if (!b.id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const fields: Record<string, unknown> = {};
  if (b.name !== undefined) fields.name = String(b.name).trim().slice(0, 80);
  if (b.description !== undefined) fields.description = String(b.description).trim().slice(0, 300);
  if (b.cost !== undefined) fields.cost = Math.max(0, Math.round(Number(b.cost) || 0));
  if (b.stock !== undefined) fields.stock = Math.max(0, Math.round(Number(b.stock) || 0));
  const codes = (b.add_codes ?? []).map((c) => c.trim()).filter(Boolean);
  if (codes.length) {
    const { error } = await db.from("reward_codes").insert(codes.map((code) => ({ reward_id: b.id, code })));
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    const { count } = await db.from("reward_codes").select("id", { count: "exact", head: true }).eq("reward_id", b.id).is("redeemed_by", null);
    fields.stock = count ?? 0; // code rewards: stock == unredeemed codes
  }
  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: true });
  const { data, error } = await db.from("rewards").update(fields).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reward: data });
}

/** DELETE ?id= */
export async function DELETE(req: Request) {
  if (!checkStaffPin(staffPinFromRequest(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "id required" }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("rewards").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
