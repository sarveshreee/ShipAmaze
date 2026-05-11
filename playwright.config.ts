import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
const skipWeb = process.env.E2E_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: skipWeb
    ? undefined
    : [
        {
          command: "npm run dev",
          cwd: "backend",
          url: "http://127.0.0.1:5000/health",
          reuseExistingServer: true,
          timeout: 180_000,
        },
        {
          command: "npm run dev",
          cwd: "frontend",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      ],
});
