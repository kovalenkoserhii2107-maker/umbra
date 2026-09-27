import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { steamData, normalizeSteam } from "./game-data-utils.mjs";
const root = new URL("../", import.meta.url);
const catalog = JSON.parse(
  readFileSync(new URL("public/steam-catalog.json", root)),
);
const dir = new URL("data/game-details/", root);
mkdirSync(dir, { recursive: true });
const headers = {
  "User-Agent":
    "Umbra/1.0 (https://github.com/kovalenkoserhii2107-maker/umbra)",
};
let failed = 0,
  done = 0,
  index = 0;
const queues = new Map();
const blockedUntil = new Map();
const disabled = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function get(url) {
  const host = new URL(url).hostname;
  if (disabled.has(host)) return Promise.resolve(null);
  const previous = queues.get(host) || Promise.resolve();
  const task = previous.then(async () => {
    if (disabled.has(host)) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(Math.max(0, (blockedUntil.get(host) || 0) - Date.now()));
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(12000),
        });
        if (response.status === 429) {
          const raw = response.headers.get("retry-after");
          const delay =
            Number(raw) * 1000 || Date.parse(raw) - Date.now() || 60000;
          blockedUntil.set(host, Date.now() + Math.max(delay, 60000));
          console.warn(`Rate limit from ${host}; respecting cooldown.`);
          if (host.includes("cheapshark") || delay > 120000) {
            disabled.add(host);
            return null;
          }
          continue;
        }
        if (response.status >= 500 && attempt < 2) {
          await sleep(2000);
          continue;
        }
        if (!response.ok) return null;
        return await response.json();
      } catch {
        if (attempt < 2) await sleep(1000);
      }
    }
    return null;
  });
  queues.set(
    host,
    task.then(() => sleep(host.includes("cheapshark") ? 1300 : 600)),
  );
  return task;
}
const storesData = await get("https://www.cheapshark.com/api/1.0/stores");
const stores = Object.fromEntries(
  (Array.isArray(storesData) ? storesData : []).map((s) => [
    s.storeID,
    s.storeName,
  ]),
);
const ids = [
  ...new Set([
    ...catalog.popular,
    ...catalog.playing,
    ...catalog.top,
    ...Object.values(catalog.games).map((g) => g.id),
  ]),
];
const limit = Number(process.env.GAME_DATA_LIMIT) || ids.length;
async function worker() {
  for (;;) {
    const i = index++;
    if (i >= Math.min(limit, ids.length)) return;
    const id = ids[i],
      file = new URL(`${id}.json`, dir);
    if (existsSync(file) && !process.env.GAME_DATA_FORCE) {
      const prev = JSON.parse(readFileSync(file));
      if (Date.now() - Date.parse(prev.checkedAt) < 86400000) continue;
    }
    const [payload, reviews, players, deals] = await Promise.all([
      get(
        `https://store.steampowered.com/api/appdetails?appids=${id}&cc=ua&l=russian`,
      ),
      get(
        `https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`,
      ),
      get(
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`,
      ),
      get(
        `https://www.cheapshark.com/api/1.0/deals?steamAppID=${id}&pageSize=60`,
      ),
    ]);
    const data = steamData(payload, id);
    if (data) {
      let next = normalizeSteam(
        data,
        reviews,
        players,
        deals,
        stores,
        new Date().toISOString(),
      );
      if (existsSync(file)) {
        const prev = JSON.parse(readFileSync(file));
        if (!reviews) {
          next.steam = prev.steam;
          next.steamReviewCount = prev.steamReviewCount;
        }
        if (!players) next.playerCount = null;
        if (!deals)
          next.offers = [
            ...next.offers,
            ...(prev.offers || []).filter((o) => o.source === "CheapShark"),
          ];
      }
      writeFileSync(new URL(`${id}.json.tmp`, dir), JSON.stringify(next));
      renameSync(new URL(`${id}.json.tmp`, dir), file);
      done++;
    } else failed++;
    if (i % 40 === 0)
      console.log(
        `${i + 1}/${Math.min(limit, ids.length)} updated=${done} unavailable=${failed}`,
      );
    await new Promise((r) => setTimeout(r, 350));
  }
}
await Promise.all([worker(), worker()]);
console.log(JSON.stringify({ updated: done, unavailable: failed }));
