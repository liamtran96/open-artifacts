import { defineConfig, devices } from "@playwright/test";

// Browser matrix from decision 0001: Chromium, Firefox, WebKit, desktop and mobile viewports.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "on-first-retry",
  },
  // Example dev servers for e2e/runtime-examples.spec.ts; pnpm e2e builds the runtime first.
  webServer: [
    ["example-plain-html-runtime", 4173],
    ["example-react-runtime", 4174],
  ].map(([pkg, port]) => ({
    command: `pnpm --filter ${String(pkg)} exec vite --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  })),
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
});
