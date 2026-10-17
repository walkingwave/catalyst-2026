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
