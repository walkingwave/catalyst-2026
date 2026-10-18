import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

/**
 * Some E2E tests send real drops/messages through the artist API to demo fans.
 * Remove anything they created (every test string starts with "E2E ") so it never shows in a demo.
 */
export async function purgeE2eContent() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const results = await Promise.all([
    db.from("drops").delete({ count: "exact" }).ilike("title", "e2e %"),
    db.from("drop_templates").delete({ count: "exact" }).ilike("title", "e2e %"),
    db.from("messages").delete({ count: "exact" }).ilike("body", "e2e %"),
    db.from("messages").delete({ count: "exact" }).ilike("body", "new poll from %: e2e %"),
    db.from("event_notifications").delete({ count: "exact" }).ilike("body", "e2e %"),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) throw new Error(`E2E cleanup failed: ${failed.error!.message}`);
  return results.reduce((n, r) => n + (r.count ?? 0), 0);
}
