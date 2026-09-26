import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5173/umbra/", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173/umbra/",
      reuseExistingServer: false,
      env: { VITE_USE_EMULATORS: "true" },
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/umbra/",
      reuseExistingServer: false,
    },
  ],
});
