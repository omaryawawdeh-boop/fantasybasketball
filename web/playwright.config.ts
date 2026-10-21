import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build in DATA_MODE=demo, so they are deterministic
// and need no network. Run `npm run build` first (npm run test:e2e does both).
const PORT = 3200;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATA_MODE: "demo", AI_PROVIDER: "" },
  },
});
