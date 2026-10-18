import { test as teardown } from "@playwright/test";
import { purgeE2eContent } from "./cleanup";

teardown("remove E2E drops and messages from demo inboxes", async () => {
  await purgeE2eContent();
});
