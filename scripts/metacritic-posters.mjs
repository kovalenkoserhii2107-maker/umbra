import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../public/steam-catalog.json", import.meta.url);
const catalog = JSON.parse(readFileSync(file, "utf8"));

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function compact(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function close(title, found) {
  const a = compact(title);
  const b = compact(found);
  const n = Math.min(10, a.length, b.length);
  if (n < 4) return false;
  return a.includes(b.slice(0, n)) || b.includes(a.slice(0, n));
}

async function posterFor(title) {
  const response = await fetch(`https://www.metacritic.com/game/${slug(title)}/`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
  if (!response.ok) return "";
  const html = await response.text();
  const match = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  );
  if (!match) return "";
  const data = JSON.parse(match[1]);
  const image = Array.isArray(data.image) ? data.image[0] : data.image;
  if (data["@type"] !== "VideoGame" || typeof image !== "string") return "";
  if (!close(title, data.name || "")) return "";
  const bare = image.split("?")[0];
  return `${bare}?auto=webp&fit=cover&height=720&width=1280`;
}

const games = Object.values(catalog.games).filter((game) => !game.poster);
let index = 0;
let found = 0;

async function worker() {
  for (;;) {
    const current = index++;
    if (current >= games.length) return;
    const game = games[current];
    try {
      const poster = await posterFor(game.title);
      if (poster) {
        catalog.games[String(game.id)].poster = poster;
        found++;
      }
    } catch {
      /* skip */
    }
    if (current % 20 === 0) {
      writeFileSync(file, JSON.stringify(catalog));
      console.log(`${current + 1}/${games.length} posters ${found}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

await Promise.all([worker(), worker(), worker()]);
writeFileSync(file, JSON.stringify(catalog));
console.log(`done posters ${found}/${games.length}`);
