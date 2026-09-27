import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const steam = read("public/steam-catalog.json"),
  consoles = read("public/console-catalog.json");
const out = new URL("public/catalog/", root);
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL("details/", out), { recursive: true });
const fold = (s) =>
  s
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const byTitle = new Map();
for (const g of Object.values(steam.games)) {
  const k = fold(g.title);
  byTitle.set(k, [...(byTitle.get(k) || []), g]);
}
function extra(id) {
  const p = new URL(`data/game-details/${id}.json`, root);
  return existsSync(p) ? JSON.parse(readFileSync(p)) : {};
}
function enrich(g, isSteam) {
  const matches = byTitle.get(fold(g.title)) || [];
  const peer = !isSteam && matches.length === 1 ? matches[0] : null;
  const steamId = isSteam ? g.id : peer?.id;
  const d = steamId ? extra(steamId) : {};
  const detail = {
    ...g,
    ...d,
    id: g.id,
    title: g.title,
    game_url: g.game_url,
    platform: g.platform,
    steamAppId: steamId,
  };
  // A console edition keeps its own Metacritic score and platform description.
  if (!isSteam) {
    detail.description = g.description || g.short_description || d.description;
    detail.releaseLabel = g.release_date;
    detail.metacritic = g.metacritic;
    detail.metacriticUrl = g.game_url;
    detail.platforms = g.platform.split(" · ").filter(Boolean);
    detail.pcDetails = !!steamId;
    detail.genre = g.genre || d.genre;
  }
  if (detail.metacritic == null && isSteam) detail.metacritic = g.metacritic;
  if (detail.steam == null) detail.steam = isSteam ? g.steam : peer?.steam;
  for (const field of [
    "description",
    "short_description",
    "developer",
    "publisher",
    "genre",
  ]) {
    if (!detail[field]) detail[field] = g[field] || peer?.[field] || "";
  }
  detail.description ||= g.short_description;
  writeFileSync(new URL(`details/${g.id}.json`, out), JSON.stringify(detail));
  // Long text and screenshots are only downloaded on the game's own page.
  return {
    id: detail.id,
    title: detail.title,
    thumbnail: detail.thumbnail,
    poster: detail.poster,
    game_url: detail.game_url,
    genre: detail.genre,
    platform: detail.platform,
    developer: detail.developer,
    publisher: detail.publisher,
    release_date: detail.release_date,
    metacritic: detail.metacritic,
    steam: detail.steam,
    short_description: "",
  };
}
for (const [name, cat] of [
  ["steam", steam],
  ["consoles", consoles],
]) {
  const games = Object.fromEntries(
    Object.values(cat.games).map((g) => [g.id, enrich(g, name === "steam")]),
  );
  writeFileSync(
    new URL(`${name}.json`, out),
    JSON.stringify({ ...cat, games }),
  );
}
console.log("Prepared lightweight catalogs and per-game detail files.");
