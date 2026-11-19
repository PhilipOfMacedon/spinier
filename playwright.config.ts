import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/spinier/",
    headless: true,
    browserName: "chromium",
    ...(process.env.CI ? {} : { channel: "msedge" as const }),
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/spinier/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
