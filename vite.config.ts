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
        "favicon-32.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "brand-mark.webp",
      ],
      manifest: {
        name: "Umbra",
        short_name: "Umbra",
        description: "Личная коллекция фильмов, сериалов и игр",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        start_url: "/umbra/",
        scope: "/umbra/",
        lang: "ru",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
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
        globPatterns: ["**/*.{js,css,svg,png,jpg,webp,woff2,ico,html,json}"],
        // Link-preview cards are for messengers, not for the app offline.
        globIgnores: ["**/og-*.png"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.igdb\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "umbra-game-images",
              expiration: { maxEntries: 300, maxAgeSeconds: 14 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
