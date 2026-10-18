import { config } from "dotenv";
import { setTimeout as delay } from "node:timers/promises";
import { createAdminClient } from "../src/lib/supabase/admin";
import { runEventNotifications } from "../src/lib/event-notifications";

config({ path: ".env.local", quiet: true });
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown.abort());

async function main() {
  const db = createAdminClient();
  console.log("Event notification worker running; checks the queue every 15 seconds.");
  while (!shutdown.signal.aborted) {
    try {
      const result = await runEventNotifications(db);
      if (result.processed) console.log(`Processed ${result.processed} notification recipients.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Notification worker failed.");
    }
    await delay(15000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}
void main().catch(() => { console.error("Could not start notification worker. Check server environment settings."); process.exitCode = 1; });
