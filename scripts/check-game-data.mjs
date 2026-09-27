import { readdirSync, readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
const root = new URL("../public/catalog/", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
let detailBytes = 0,
  largest = 0,
  count = 0;
for (const catalog of ["steam.json", "consoles.json"]) {
  const data = read(catalog);
  for (const [key, card] of Object.entries(data.games)) {
    assert.equal(String(card.id), key);
    const detail = read(`details/${key}.json`);
    assert.equal(detail.id, card.id);
    assert.equal(detail.title, card.title);
    for (const field of ["steam", "metacritic"])
      assert(
        detail[field] == null ||
          (Number.isFinite(detail[field]) &&
            detail[field] >= 0 &&
            detail[field] <= 100),
      );
    for (const offer of detail.offers || []) {
      assert(Number.isFinite(offer.price) && offer.price >= 0);
      assert(Number.isFinite(Date.parse(offer.checkedAt)));
      assert(
        /^https:\/\/(?:www\.cheapshark\.com\/redirect\?|store\.steampowered\.com\/app\/)/.test(
          offer.url,
        ),
      );
      assert(/^[A-Z]{3}$/.test(offer.currency));
    }
    for (const field of [
      "description",
      "screenshots",
      "offers",
      "requirements",
    ])
      assert(!(field in card), "Heavy fields must stay out of indexes");
    const size = statSync(new URL(`details/${key}.json`, root)).size;
    detailBytes += size;
    largest = Math.max(largest, size);
    count++;
  }
}
assert(count > 0);
assert.equal(
  readdirSync(new URL("details/", root)).length,
  count,
  "No stale detail files",
);
console.log(
  JSON.stringify({
    games: count,
    averageDetailBytes: Math.round(detailBytes / count),
    largestDetailBytes: largest,
  }),
);
