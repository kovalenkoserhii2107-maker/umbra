import { writeFileSync } from "node:fs";

const out = new URL("../public/steam-catalog.json", import.meta.url);

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

function appidFromLogo(logo = "") {
  const match = String(logo).match(/\/apps\/(\d+)\//);
  return match ? Number(match[1]) : 0;
}

function yearOf(date) {
  const match = String(date || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function clean(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchList(filter) {
  const data = await getJson(
    `https://store.steampowered.com/search/results/?json=1&category1=998&filter=${filter}&ndl=1&ignore_preferences=1&cc=US&l=english`,
  );
  return (data?.items || [])
    .map((item) => ({
      id: appidFromLogo(item.logo),
      title: item.name || "",
      thumbnail: item.logo || "",
    }))
    .filter((item) => item.id && !/demo|soundtrack|dlc/i.test(item.title));
}

function readDetails(details, appid) {
  if (!details || typeof details !== "object") return null;
  const nodes = Object.values(details);
  const node =
    nodes.find((item) => item?.data?.steam_appid === appid) || nodes[0];
  const data = node?.data;
  if (!data || data.steam_appid !== appid) return null;
  return data;
}

async function enrich(game) {
  const [details, reviews] = await Promise.all([
    getJson(
      `https://store.steampowered.com/api/appdetails?appids=${game.id}&cc=us&l=en`,
    ),
    getJson(
      `https://store.steampowered.com/appreviews/${game.id}?json=1&language=all&purchase_type=all&num_per_page=0`,
    ),
  ]);
  const data = readDetails(details, game.id);
  const summary = reviews?.query_summary;
  const total = summary?.total_reviews || 0;
  const steam =
    total >= 50 ? Math.round((100 * summary.total_positive) / total) : null;
  const metacritic =
    typeof data?.metacritic?.score === "number" ? data.metacritic.score : null;
  const date = data?.release_date?.date || "";
  return {
    id: game.id,
    title: data?.name || game.title,
    thumbnail: data?.header_image || game.thumbnail,
    short_description: clean(data?.short_description).slice(0, 400),
    game_url: `https://store.steampowered.com/app/${game.id}`,
    genre: data?.genres?.[0]?.description || "",
    platform: "PC (Steam)",
    publisher: data?.publishers?.[0] || "",
    developer: data?.developers?.[0] || "",
    release_date: yearOf(date),
    metacritic,
    steam,
  };
}

const [sellers, upcoming, charts] = await Promise.all([
  searchList("globaltopsellers"),
  searchList("popularcomingsoon"),
  getJson(
    "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/?format=json",
  ),
]);
const playing = (charts?.response?.ranks || []).map((row) => ({
  id: row.appid,
  title: "",
  thumbnail: "",
}));

const order = [];
const seen = new Set();
for (const item of [...sellers, ...playing, ...upcoming]) {
  if (!item.id || seen.has(item.id)) continue;
  seen.add(item.id);
  order.push(item);
}

const games = {};
let index = 0;
async function worker() {
  for (;;) {
    const current = index++;
    if (current >= order.length) return;
    try {
      games[order[current].id] = await enrich(order[current]);
    } catch {
      /* skip */
    }
    if (current % 20 === 0) console.log(`${current + 1}/${order.length}`);
    await new Promise((resolve) => setTimeout(resolve, 280));
  }
}
await Promise.all([worker(), worker()]);

const ids = (list) => list.map((item) => item.id).filter((id) => games[id]);
const catalog = {
  popular: ids(sellers),
  playing: ids(playing),
  upcoming: ids(upcoming),
  top: ids(playing),
  games,
};
writeFileSync(out, JSON.stringify(catalog));
const rated = Object.values(games).filter((game) => game.metacritic != null).length;
console.log(
  `popular ${catalog.popular.length} playing ${catalog.playing.length} upcoming ${catalog.upcoming.length} metacritic ${rated}/${Object.keys(games).length}`,
);
