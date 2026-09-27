import { writeFileSync } from "node:fs";

const out = new URL("../public/steam-ratings.json", import.meta.url);

function norm(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unwanted(name) {
  return /soundtrack|dlc|demo|artbook|art book|wallpaper|trailer/.test(norm(name));
}

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
    });
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}

async function lookup(title) {
  const search = await getJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`,
  );
  const wanted = norm(title);
  const hit = (search?.items || []).find(
    (item) => item.type === "app" && norm(item.name) === wanted && !unwanted(item.name),
  );
  if (!hit) return null;
  const [details, reviews] = await Promise.all([
    getJson(
      `https://store.steampowered.com/api/appdetails?appids=${hit.id}&cc=us&l=en`,
    ),
    getJson(
      `https://store.steampowered.com/appreviews/${hit.id}?json=1&language=all&purchase_type=all&num_per_page=0`,
    ),
  ]);
  const data = details?.[hit.id]?.data || details?.[String(hit.id)]?.data;
  const metacritic = data?.metacritic?.score;
  const summary = reviews?.query_summary;
  const total = summary?.total_reviews || 0;
  const steam =
    total >= 50 ? Math.round((100 * summary.total_positive) / total) : null;
  if (typeof metacritic !== "number" && steam == null) return null;
  return {
    appid: hit.id,
    metacritic: typeof metacritic === "number" ? metacritic : null,
    steam,
  };
}

const games = await getJson("https://www.freetogame.com/api/games");
if (!Array.isArray(games)) throw new Error("catalog unavailable");

const scores = {};
let index = 0;
async function worker() {
  for (;;) {
    const current = index++;
    if (current >= games.length) return;
    const game = games[current];
    try {
      const score = await lookup(game.title);
      if (score) scores[game.id] = score;
    } catch {
      /* skip */
    }
    if (current % 25 === 0) {
      writeFileSync(out, JSON.stringify(scores));
      console.log(`${current + 1}/${games.length} matched ${Object.keys(scores).length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

await Promise.all(Array.from({ length: 3 }, worker));
writeFileSync(out, JSON.stringify(scores));
console.log(`done ${Object.keys(scores).length}/${games.length}`);
