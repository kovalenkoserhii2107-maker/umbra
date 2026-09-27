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
        "brand-mark.png",
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
        globPatterns: ["**/*.{js,css,svg,png,jpg,woff2,ico,html,json}"],
        globIgnores: [
          "**/catalog/**",
          "**/steam-catalog.json",
          "**/console-catalog.json",
          "**/steam-ratings.json",
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              /^\/umbra\/catalog\/(steam|consoles)\.json$/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "umbra-game-catalogs",
              expiration: { maxEntries: 2, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern:
              /^https:\/\/(?:shared\.fastly\.steamstatic\.com|cdn\.cloudflare\.steamstatic\.com|www\.metacritic\.com\/a\/img)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "umbra-game-images",
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/umbra/catalog/details/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "umbra-game-details",
              expiration: { maxEntries: 80, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [200] },
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
