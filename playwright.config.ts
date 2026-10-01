import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5187/umbra/", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5187 --strictPort",
      url: "http://127.0.0.1:5187/umbra/",
      reuseExistingServer: false,
      // TMDB is mocked in the tests; any key lets the client send requests.
      env: {
        VITE_USE_EMULATORS: "true",
        VITE_TMDB_KEY: process.env.VITE_TMDB_KEY || "e2e-test-key",
        // Calls to the game API worker are mocked in the tests.
        VITE_API_URL: process.env.VITE_API_URL || "https://umbra-api.test",
      },
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 4187",
      url: "http://127.0.0.1:4187/umbra/",
      reuseExistingServer: false,
    },
  ],
});
