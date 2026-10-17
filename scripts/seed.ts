/**
 * Demo seed. Run: npm run seed
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Re-runnable: wipes previous demo data (demo concert, demo users, rewards) first.
 */
import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const DEMO_PHONE_PREFIX = "+1555010"; // +15550100xx are fake demo fans
const DEMO_USERS = [
  { name: "Maya R.", phone: "+15550100001" },
  { name: "Jordan K.", phone: "+15550100002" },
  { name: "Priya S.", phone: "+15550100003" },
  { name: "Leo T.", phone: "+15550100004" },
  { name: "Sam W.", phone: "+15550100005" },
  { name: "Ava M.", phone: "+15550100006" },
];

// Fake NTAG215-style UIDs (7 bytes, hex). Write these to your tags, or
// just scan a real tag at /staff: unknown bands are auto-registered.
const BAND_UIDS = [
  "04A1B2C3D4E501",
  "04A1B2C3D4E502",
  "04A1B2C3D4E503",
  "04A1B2C3D4E504",
  "04A1B2C3D4E505",
  "04A1B2C3D4E506",
  "04A1B2C3D4E507",
  "04A1B2C3D4E508",
  "04A1B2C3D4E509",
  "04A1B2C3D4E510",
];

function fail(step: string, error: unknown): never {
  console.error(`[seed] ${step} failed:`, error);
  process.exit(1);
}

async function wipe() {
  console.log("[seed] wiping previous demo data");
  // Concerts cascade to bands, activities, scans.
  const { error: cErr } = await db
    .from("concerts")
    .delete()
    .in("name", ["Catalyst Fest 2026", "Catalyst Fest 2025", "Our Lady Peace: Clumsy 30", "Neon Harbor: Warehouse Sessions"]);
  if (cErr) fail("delete concerts", cErr);
  const { error: rErr } = await db.from("rewards").delete().gte("cost", 0);
  if (rErr) fail("delete rewards", rErr);

  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (u.phone && `+${u.phone}`.startsWith(DEMO_PHONE_PREFIX)) {
      await db.auth.admin.deleteUser(u.id);
    }
  }
}

async function createUsers() {
  console.log("[seed] creating demo fans");
  const ids: string[] = [];
  for (const u of DEMO_USERS) {
    const { data, error } = await db.auth.admin.createUser({
      phone: u.phone,
      phone_confirm: true,
      user_metadata: { name: u.name },
    });
    if (error || !data.user) fail(`create user ${u.phone}`, error);
    ids.push(data.user.id);
  }
  // Trigger mirrors into public.users; make sure names landed.
  for (let i = 0; i < ids.length; i++) {
    await db.from("users").upsert({ id: ids[i], name: DEMO_USERS[i].name, phone: DEMO_USERS[i].phone });
  }
  return ids;
}

async function main() {
  await wipe();
  const userIds = await createUsers();

  console.log("[seed] creating concerts + activities");
  const today = new Date().toISOString().slice(0, 10);
  const { data: concert, error: cErr } = await db
    .from("concerts")
    .insert({
      name: "Our Lady Peace: Clumsy 30",
      artist: "Our Lady Peace",
      venue: "Massey Hall",
      address: "178 Victoria St, Toronto, ON",
      doors_at: "7:00 PM",
      description: "Our Lady Peace play Clumsy front to back, plus a second set of hits, at Toronto's Massey Hall.",
      image_url: "/img/our-lady-peace.jpg",
      venue_image_url: "/img/massey-hall.jpg",
      date: today,
    })
    .select()
    .single();
  if (cErr || !concert) fail("insert concert", cErr);

  const { data: pastConcert, error: pErr } = await db
    .from("concerts")
    .insert({ name: "Neon Harbor: Warehouse Sessions", artist: "Neon Harbor", venue: "The Warehouse", address: "1 Polson St, Toronto, ON", doors_at: "8:00 PM", date: "2025-10-11" })
    .select()
    .single();
  if (pErr || !pastConcert) fail("insert past concert", pErr);

  // map_x / map_y are percent positions on the venue floor plan (stage at top, lobby at bottom).
  const activityRows = [
    { name: "Entry", points: 50, map_x: 50, map_y: 91, location: "Shuter St doors", icon: "entry" },
    { name: "Merch Booth", points: 100, map_x: 22, map_y: 80, location: "Main lobby, west wall", icon: "merch" },
    { name: "Photo Wall", points: 75, map_x: 78, map_y: 80, location: "Main lobby, east wall", icon: "photo" },
    { name: "Trivia", points: 120, map_x: 15, map_y: 46, location: "Centuries Bar, level 2", icon: "trivia" },
    { name: "Meet & Greet", points: 200, map_x: 84, map_y: 14, location: "Stage door, backstage left", icon: "meet" },
  ];
  const { data: activities, error: aErr } = await db
    .from("activities")
    .insert(activityRows.map((a) => ({ ...a, concert_id: concert.id })))
    .select();
  if (aErr || !activities) fail("insert activities", aErr);
  const { data: pastActivities, error: paErr } = await db
    .from("activities")
    .insert(
      [
        { name: "Entry", points: 50 },
        { name: "Merch Booth", points: 100 },
        { name: "Photo Wall", points: 75 },
      ].map((a) => ({ ...a, concert_id: pastConcert.id })),
    )
    .select();
  if (paErr || !pastActivities) fail("insert past activities", paErr);

  const act = (name: string) => activities.find((a) => a.name === name)!.id;

  console.log("[seed] creating bands");
  // 0-3 claimed, 4-6 scanned but unclaimed, 7-9 fresh (no scans)
  const bands = BAND_UIDS.map((uid, i) => ({
    uid,
    concert_id: concert.id,
    user_id: i < 4 ? userIds[i] : null,
    claimed_at: i < 4 ? new Date().toISOString() : null,
  }));
  const { error: bErr } = await db.from("bands").insert(bands);
  if (bErr) fail("insert bands", bErr);

  // Past-concert bands for users 0,1,4,5 so all-time leaderboard differs from tonight.
  const pastBands = [0, 1, 4, 5].map((i, n) => ({
    uid: `04FF00000000${n + 1}`,
    concert_id: pastConcert.id,
    user_id: userIds[i],
    claimed_at: "2025-10-11T21:00:00Z",
  }));
  const { error: pbErr } = await db.from("bands").insert(pastBands);
  if (pbErr) fail("insert past bands", pbErr);

  console.log("[seed] creating scans");
  const scanPlan: Record<string, string[]> = {
    [BAND_UIDS[0]]: ["Entry", "Merch Booth", "Photo Wall", "Trivia", "Meet & Greet"],
    [BAND_UIDS[1]]: ["Entry", "Trivia", "Photo Wall"],
    [BAND_UIDS[2]]: ["Entry", "Merch Booth"],
    [BAND_UIDS[3]]: ["Entry"],
    [BAND_UIDS[4]]: ["Entry", "Photo Wall", "Trivia"], // unclaimed, 245 pts -> demo claim
    [BAND_UIDS[5]]: ["Entry", "Merch Booth"],
    [BAND_UIDS[6]]: ["Entry"],
  };
  const scans: { band_uid: string; activity_id: string; scanned_at: string }[] = [];
  let t = Date.now() - 1000 * 60 * 90;
  for (const [uid, names] of Object.entries(scanPlan)) {
    for (const n of names) {
      t += 1000 * 60 * 3;
      scans.push({ band_uid: uid, activity_id: act(n), scanned_at: new Date(t).toISOString() });
    }
  }
  for (const pb of pastBands) {
    for (const a of pastActivities) {
      scans.push({ band_uid: pb.uid, activity_id: a.id, scanned_at: "2025-10-11T22:00:00Z" });
    }
  }
  const { error: sErr } = await db.from("scans").insert(scans);
  if (sErr) fail("insert scans", sErr);

  console.log("[seed] creating rewards");
  const { data: rewards, error: rErr } = await db
    .from("rewards")
    .insert([
      { name: "20% off merch", description: "Show the code at the merch booth tonight.", cost: 150, type: "discount_code", stock: 5 },
      { name: "Free poster", description: "Limited run tour poster. Pick up at merch.", cost: 300, type: "merch", stock: 10 },
      { name: "Signed setlist", description: "One of five. Collect at the info desk.", cost: 500, type: "merch", stock: 5 },
      { name: "$10 off next show", description: "Code for the next Catalyst Fest ticket.", cost: 400, type: "discount_code", stock: 3 },
    ])
    .select();
  if (rErr || !rewards) fail("insert rewards", rErr);

  const codeRows: { reward_id: string; code: string }[] = [];
  for (const r of rewards) {
    if (r.type !== "discount_code") continue;
    for (let i = 1; i <= r.stock; i++) {
      codeRows.push({ reward_id: r.id, code: `${r.name.includes("20%") ? "MERCH20" : "NEXT10"}-${String(i).padStart(3, "0")}` });
    }
  }
  const { error: codeErr } = await db.from("reward_codes").insert(codeRows);
  if (codeErr) fail("insert reward codes", codeErr);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  console.log("\n[seed] done.\n");
  console.log("Concert:", concert.name, concert.id);
  console.log("Claimed bands (owned by demo fans):", BAND_UIDS.slice(0, 4).join(", "));
  console.log("Unclaimed bands with points (try claiming):", BAND_UIDS.slice(4, 7).join(", "));
  console.log("Fresh bands (no scans):", BAND_UIDS.slice(7).join(", "));
  console.log(`\nTap URL example: ${site}/b/${BAND_UIDS[4]}`);
}

main().catch((e) => fail("main", e));
