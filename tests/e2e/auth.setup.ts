import { test as setup } from "@playwright/test";
import { adminHeaders, loginAs } from "./helpers";

const FILE = "tests/e2e/.auth/fan.json";

setup("purge leftovers from aborted runs", async ({ request }) => {
  const { events, artists } = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
  for (const e of events as { id: string; name: string }[]) if (/^E2E /.test(e.name)) await request.delete(`/api/admin/events?id=${e.id}`, { headers: adminHeaders });
  for (const a of artists as { id: string; name: string }[]) if (/^E2E /.test(a.name)) await request.delete(`/api/admin/artists?id=${a.id}`, { headers: adminHeaders });
});

setup("sign in as Demo Fan", async ({ page }) => {
  await loginAs(page);
  await page.context().storageState({ path: FILE });
});
