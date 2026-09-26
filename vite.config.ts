import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
function revision() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}
export default defineConfig({
  base: "/umbra/",
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.GITHUB_SHA?.slice(0, 7) || revision(),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "icon.svg",
        "icon-maskable.svg",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Umbra",
        short_name: "Umbra",
        description: "Личная картотека фильмов и сериалов",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        start_url: "/umbra/",
        scope: "/umbra/",
        lang: "ru",
        icons: [
          {
            src: "icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-maskable.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "umbra",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [/^\/umbra(?:\/|$)/],
        globPatterns: ["**/*.{js,css,svg,png,woff2,ico,html}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "umbra-posters",
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
