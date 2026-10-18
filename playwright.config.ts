import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the dev server with the live Supabase project.
 * Fans sign in with Supabase test OTP numbers (code 123456), see README.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, teardown: "teardown", use: { ...devices["iPhone 14"], browserName: "chromium" } },
    // Runs after every project that depends on setup: removes E2E drops/messages from demo inboxes.
    { name: "teardown", testMatch: /global\.teardown\.ts/ },
    // API + public pages: no session.
    { name: "public", testMatch: /(api|public|band|staff|admin|artist|a11y)\.spec\.ts/, dependencies: ["setup"], use: { ...devices["iPhone 14"], browserName: "chromium" } },
    // Fan pages: reuse the signed-in session from setup.
    {
      name: "fan",
      testMatch: /fan\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPhone 14"], browserName: "chromium", storageState: "tests/e2e/.auth/fan.json" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
