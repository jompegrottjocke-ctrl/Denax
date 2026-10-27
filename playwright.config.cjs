const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1600, height: 1100 },
    launchOptions: {
      ...(process.env.DENAX_CHROMIUM_PATH
        ? { executablePath: process.env.DENAX_CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
