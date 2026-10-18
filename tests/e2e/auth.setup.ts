import { test as setup } from "@playwright/test";
import { adminHeaders, loginAs } from "./helpers";
import { purgeE2eContent } from "./cleanup";

const FILE = "tests/e2e/.auth/fan.json";

setup("purge leftovers from aborted runs", async ({ request }) => {
  const { events, artists } = await (await request.get("/api/admin/events", { headers: adminHeaders })).json();
  for (const e of events as { id: string; name: string }[]) if (/^E2E /.test(e.name)) await request.delete(`/api/admin/events?id=${e.id}`, { headers: adminHeaders });
  for (const a of artists as { id: string; name: string }[]) if (/^E2E /.test(a.name)) await request.delete(`/api/admin/artists?id=${a.id}`, { headers: adminHeaders });
  const ph = { "x-artist-code": "OLP2026" };
  const { polls = [] } = await (await request.get("/api/artist/polls", { headers: ph })).json();
  for (const p of polls as { id: string; question: string }[]) if (/^E2E /.test(p.question)) await request.delete(`/api/artist/polls?id=${p.id}`, { headers: ph });
  await purgeE2eContent();
});

setup("sign in as the test fan", async ({ page }) => {
  await loginAs(page);
  await page.context().storageState({ path: FILE });
});
