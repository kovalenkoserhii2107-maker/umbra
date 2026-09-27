import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../public/steam-catalog.json", import.meta.url);
const catalog = JSON.parse(readFileSync(file, "utf8"));

function decode(value) {
  return String(value || "")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function yearOf(date) {
  const match = String(date || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function unreleased(date) {
  return /soon|tba|announc|coming/i.test(date);
}

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
    });
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}

function parseResults(html) {
  return String(html || "")
    .split('data-ds-appid="')
    .slice(1)
    .map((chunk) => {
      const id = Number((chunk.match(/^(\d+)/) || [])[1]);
      const title = decode((chunk.match(/<span class="title">([^<]*)<\/span>/) || [])[1]);
      const thumbnail = (chunk.match(/<img src="([^"]+)"/) || [])[1] || "";
      const released = decode(
        (chunk.match(/search_released[^>]*>\s*([^<]*?)\s*</) || [])[1] || "",
      ).trim();
      const steamText = (chunk.match(/(\d+)% of the/) || [])[1];
      return {
        id,
        title,
        thumbnail,
        released,
        release_date: yearOf(released),
        sort: yearOf(released)
          ? Number(yearOf(released))
          : unreleased(released)
            ? 10000
            : 0,
        steam: steamText ? Number(steamText) : null,
      };
    })
    .filter((game) => game.id && game.title && !/demo|soundtrack|dlc/i.test(game.title));
}

async function studioList(developer) {
  const found = [];
  const seen = new Set();
  for (let start = 0; start < 150; start += 50) {
    const data = await getJson(
      `https://store.steampowered.com/search/results/?infinite=1&developer=${encodeURIComponent(developer)}&category1=998&ndl=1&sort_by=Released_DESC&cc=US&l=english&count=50&start=${start}`,
    );
    const batch = parseResults(data?.results_html);
    for (const game of batch) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      found.push(game);
    }
    if (!batch.length || found.length >= (data?.total_count || 0)) break;
  }
  found.sort((a, b) => b.sort - a.sort);
  return found;
}

catalog.studios = catalog.studios || {};
const developers = [
  ...new Set(
    Object.values(catalog.games)
      .map((game) => game.developer)
      .filter((name) => name && !catalog.studios?.[name]),
  ),
];
let index = 0;

async function worker() {
  for (;;) {
    const current = index++;
    if (current >= developers.length) return;
    const developer = developers[current];
    try {
      const list = await studioList(developer);
      const ids = [];
      for (const game of list) {
        ids.push(game.id);
        const key = String(game.id);
        if (!catalog.games[key]) {
          catalog.games[key] = {
            id: game.id,
            title: game.title,
            thumbnail: game.thumbnail,
            short_description: "",
            game_url: `https://store.steampowered.com/app/${game.id}`,
            genre: "",
            platform: "PC (Steam)",
            publisher: "",
            developer,
            release_date: game.release_date,
            metacritic: null,
            steam: game.steam,
          };
        } else if (!catalog.games[key].developer) {
          catalog.games[key].developer = developer;
        }
      }
      catalog.studios[developer] = ids;
    } catch {
      /* skip studio */
    }
    if (current % 15 === 0) {
      writeFileSync(file, JSON.stringify(catalog));
      console.log(`${current + 1}/${developers.length} ${developer}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

await Promise.all([worker(), worker()]);
writeFileSync(file, JSON.stringify(catalog));
console.log(
  `studios ${Object.keys(catalog.studios).length} games ${Object.keys(catalog.games).length}`,
);
