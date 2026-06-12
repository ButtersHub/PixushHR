import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: [
    {
      command: "npm --prefix ../engine run start",
      env: { PORT: "3000", HERMES_MODE: "stub" },
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --port 5173",
      env: { VITE_ENGINE_URL: "http://localhost:3000" },
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
