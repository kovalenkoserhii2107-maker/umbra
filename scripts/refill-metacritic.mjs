import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../public/steam-ratings.json", import.meta.url);
const scores = JSON.parse(readFileSync(file, "utf8"));
const rows = Object.entries(scores).filter(([, score]) => score.metacritic == null);

async function metacritic(appid) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" } },
    );
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) return null;
    const details = await response.json();
    const data = Object.values(details).find(
      (item) => item?.data?.steam_appid === appid,
    )?.data;
    return typeof data?.metacritic?.score === "number"
      ? data.metacritic.score
      : null;
  }
  return null;
}

let index = 0;
let found = 0;
async function worker() {
  for (;;) {
    const current = index++;
    if (current >= rows.length) return;
    const [id, score] = rows[current];
    const value = await metacritic(score.appid);
    if (typeof value === "number") {
      scores[id].metacritic = value;
      found++;
    }
    if (current % 20 === 0) {
      writeFileSync(file, JSON.stringify(scores));
      console.log(`${current + 1}/${rows.length} metacritic ${found}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}

await worker();
writeFileSync(file, JSON.stringify(scores));
const total = Object.values(scores).filter((item) => item.metacritic != null).length;
console.log(`done metacritic ${total}/${rows.length}`);
