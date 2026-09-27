import { writeFileSync } from "node:fs";

const file = new URL("../public/console-catalog.json", import.meta.url);

function hash(slug) {
  let value = 2166136261;
  for (const char of slug) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) % 900_000_000 + 100_000_000;
}

function slugsFrom(html) {
  return html
    .split('data-testid="filter-results"')
    .slice(1)
    .map((part) => {
      const href = (part.match(/href="(\/game\/[^"]+)"/) || [])[1] || "";
      return href.split("/").filter(Boolean).pop() || "";
    })
    .filter(Boolean);
}

async function page(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
  if (!response.ok) return [];
  return slugsFrom(await response.text());
}

async function list(url, pages) {
  const found = [];
  for (let index = 1; index <= pages; index++) {
    const batch = await page(`${url}${url.includes("?") ? "&" : "?"}page=${index}`);
    if (!batch.length) break;
    found.push(...batch);
  }
  return [...new Set(found)];
}

async function details(slug) {
  const response = await fetch(`https://www.metacritic.com/game/${slug}/`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  );
  if (!match) return null;
  const data = JSON.parse(match[1]);
  const image = Array.isArray(data.image) ? data.image[0] : data.image;
  if (typeof image !== "string" || !data.name) return null;
  const year = String(data.datePublished || "").slice(0, 4);
  const score = Number(data.aggregateRating?.ratingValue);
  return {
    title: data.name,
    description: data.description || "",
    poster: `${image.split("?")[0]}?auto=webp&fit=cover&height=720&width=1280`,
    release_date: /^\d{4}$/.test(year) ? year : "",
    metacritic: Number.isFinite(score) ? Math.round(score) : null,
  };
}

const shelves = {
  playstation: {
    popular: await list(
      "https://www.metacritic.com/browse/game/ps5/all/all-time/",
      1,
    ),
    upcoming: await list(
      "https://www.metacritic.com/browse/game/?releaseType=coming-soon&platform=ps5",
      2,
    ),
    top: await list(
      "https://www.metacritic.com/browse/game/ps5/all/all-time/",
      5,
    ),
  },
  xbox: {
    popular: await list(
      "https://www.metacritic.com/browse/game/xbox-series-x/all/all-time/",
      1,
    ),
    upcoming: await list(
      "https://www.metacritic.com/browse/game/?releaseType=coming-soon&platform=xbox-series-x",
      2,
    ),
    top: await list(
      "https://www.metacritic.com/browse/game/xbox-series-x/all/all-time/",
      5,
    ),
  },
};

const slugs = [
  ...new Set(
    Object.values(shelves).flatMap((shelf) =>
      Object.values(shelf).flat(),
    ),
  ),
];
const games = {};
let index = 0;

async function worker() {
  for (;;) {
    const current = index++;
    if (current >= slugs.length) return;
    const slug = slugs[current];
    try {
      const info = await details(slug);
      if (info) {
        const id = hash(slug);
        games[String(id)] = {
          id,
          title: info.title,
          thumbnail: info.poster,
          poster: info.poster,
          short_description: info.description,
          description: info.description,
          game_url: `https://www.metacritic.com/game/${slug}/`,
          genre: "",
          platform: "",
          publisher: "",
          developer: "",
          release_date: info.release_date,
          metacritic: info.metacritic,
          steam: null,
        };
      }
    } catch {
      /* skip */
    }
    if (current % 20 === 0) console.log(`${current + 1}/${slugs.length}`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

await Promise.all([worker(), worker(), worker()]);

function ids(list, platform) {
  return list
    .map((slug) => {
      const id = hash(slug);
      const game = games[String(id)];
      if (game && !game.platform.includes(platform)) {
        game.platform = game.platform ? `${game.platform} · ${platform}` : platform;
      }
      return game ? id : 0;
    })
    .filter(Boolean);
}

const catalog = {
  playstation: {
    popular: ids(shelves.playstation.popular, "PlayStation 5"),
    upcoming: ids(shelves.playstation.upcoming, "PlayStation 5"),
    top: ids(shelves.playstation.top, "PlayStation 5"),
  },
  xbox: {
    popular: ids(shelves.xbox.popular, "Xbox Series"),
    upcoming: ids(shelves.xbox.upcoming, "Xbox Series"),
    top: ids(shelves.xbox.top, "Xbox Series"),
  },
  games,
};
writeFileSync(file, JSON.stringify(catalog));
console.log(
  `ps ${catalog.playstation.top.length} xbox ${catalog.xbox.top.length} games ${Object.keys(games).length}`,
);
