export type Rankable = {
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

const INDIAN = new Set([
  "hi",
  "ta",
  "te",
  "ml",
  "kn",
  "bn",
  "mr",
  "pa",
  "gu",
  "ur",
  "as",
  "or",
  "ne",
  "si",
]);
const LATER = new Set(["ko", "ja", "zh", "cn", "th", "vi", "id", "ms"]);

export function catalogBand(item: Rankable) {
  const lang = item.original_language || "";
  if (INDIAN.has(lang)) return 3;
  if (LATER.has(lang)) return 2;
  const raw = item.release_date || item.first_air_date || "";
  const at = Date.parse(raw);
  if (Number.isFinite(at)) {
    const days = (Date.now() - at) / 86_400_000;
    if (days >= -30 && days <= 120) return 0;
  }
  return 1;
}

export function byCatalogRank<T extends Rankable>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const band = catalogBand(a.item) - catalogBand(b.item);
      if (band) return band;
      const pop = (b.item.popularity || 0) - (a.item.popularity || 0);
      if (pop) return pop;
      return a.index - b.index;
    })
    .map((row) => row.item);
}
