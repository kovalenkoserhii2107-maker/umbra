import type { LibraryItem } from "../library";
import { metaKey, type MetaMap } from "../meta";
import type { MediaType } from "../tmdb";
import { signalKey, type SignalMap, type TitleSignals } from "./signals";

/**
 * The taste profile: what the library says about the person, built from
 * every mark, not only ratings.
 *
 * Each title gets a weight from -1 (strong dislike) to 1 (love):
 * - ratings are read against the person's own scale (z-score), so a strict
 *   critic's 7 counts like a generous one's 9;
 * - dropped titles count as dislikes, watched without a rating and
 *   "watching" as mild likes, the watchlist as a hint of intent;
 * - old marks fade a little: taste drifts (half-life about two years).
 *
 * Weights then add up per genre, keyword, director, actor, language,
 * decade and format, shrunk towards zero when there is little evidence.
 */

export type Seed = {
  type: MediaType;
  id: number;
  title: string;
  rating: number | null;
  weight: number;
};

export type Director = { name: string; score: number; n: number; avg: number };

export type Profile = {
  /** Titles that took part, and those with a rating. */
  engaged: number;
  rated: number;
  /** The person's rating scale. */
  mean: number;
  spread: number;
  /** How much the person's ratings follow the audience's: -1…1. */
  followsCrowd: number;
  genres: Map<number, number>;
  keywords: Map<number, number>;
  directors: Map<number, Director>;
  cast: Map<number, number>;
  /** Share of liked titles per original language (besides English). */
  languages: Map<string, number>;
  /** Liking per decade, 0…1 (best decade = 1). */
  decades: Map<number, number>;
  /** Share of movies among what the person engages with, 0…1. */
  movieShare: number;
  /** Typical log10(vote count) of liked titles: mainstream or niche. */
  mainstream: number | null;
  /** Liked titles whose recommendations feed the picks, best first. */
  seeds: Seed[];
  /** Disliked titles: what TMDB recommends after them counts against. */
  antiSeeds: Seed[];
};

const HALF_LIFE_DAYS = 730;

const clamp = (n: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, n));

export function ratingScale(items: LibraryItem[]) {
  const rated = items.filter((x) => x.rating !== null).map((x) => x.rating!);
  if (!rated.length) return { mean: 7, spread: 1.5, rated: 0 };
  const mean = rated.reduce((a, b) => a + b, 0) / rated.length;
  const sd = Math.sqrt(
    rated.reduce((a, b) => a + (b - mean) ** 2, 0) / rated.length,
  );
  return { mean, spread: Math.max(1, sd), rated: rated.length };
}

/** How the person feels about a title, -1…1, before fading. */
export function titleWeight(
  item: LibraryItem,
  scale: { mean: number; spread: number },
) {
  if (item.status === "dropped") return -0.9;
  if (item.rating !== null) {
    let w = clamp((item.rating - scale.mean) / scale.spread / 2);
    // The ends of the scale mean what they say, whatever the habit.
    if (item.rating >= 9) w = Math.max(w, 0.8);
    else if (item.rating >= 8) w = Math.max(w, 0.45);
    if (item.rating <= 4) w = Math.min(w, -0.7);
    else if (item.rating <= 5) w = Math.min(w, -0.4);
    return w;
  }
  if (item.status === "watching") return 0.4;
  if (item.status === "watched") return 0.25;
  return 0.12; // watchlist: intent, not experience
}

export function fade(updatedAt: number, now: number) {
  const days = Math.max(0, (now - updatedAt) / 86400_000);
  return 0.6 + 0.4 * 0.5 ** (days / HALF_LIFE_DAYS);
}

/** Which library titles are worth asking TMDB about, a varied set each day. */
export function signalTitles(
  items: LibraryItem[],
  random: () => number,
): LibraryItem[] {
  const scale = ratingScale(items);
  const weighed = items
    .filter((x) => x.status !== "watchlist")
    .map((x) => ({ x, w: titleWeight(x, scale) }));
  const liked = weighed
    .filter((t) => t.w >= 0.3)
    .sort((a, b) => b.w - a.w || b.x.updatedAt - a.x.updatedAt);
  // The six best always; four more from the rest, different each time.
  const rest = liked.slice(6);
  const extra: typeof rest = [];
  while (rest.length && extra.length < 4)
    extra.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  const disliked = weighed
    .filter((t) => t.w <= -0.35)
    .sort((a, b) => b.x.updatedAt - a.x.updatedAt)
    .slice(0, 4);
  const recent = weighed
    .filter((t) => t.w > 0 && t.w < 0.3)
    .sort((a, b) => b.x.updatedAt - a.x.updatedAt)
    .slice(0, 2);
  return [...liked.slice(0, 6), ...extra, ...disliked, ...recent].map(
    (t) => t.x,
  );
}

function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 5) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

class Tally<K> {
  private rows = new Map<K, { sum: number; n: number }>();
  add(key: K, w: number) {
    const row = this.rows.get(key) ?? { sum: 0, n: 0 };
    row.sum += w;
    row.n += 1;
    this.rows.set(key, row);
  }
  /** Average weight, shrunk towards 0 by `prior` imaginary neutral titles. */
  shrunk(prior: number) {
    const out = new Map<K, number>();
    for (const [k, { sum, n }] of this.rows)
      out.set(k, clamp(sum / (n + prior)));
    return out;
  }
  entries() {
    return this.rows.entries();
  }
}

export function buildProfile(
  items: LibraryItem[],
  meta: MetaMap,
  signals: SignalMap,
  /** Genre names as the library meta stores them → TMDB ids. */
  genreIds: Map<string, number>,
  now = Date.now(),
): Profile {
  const scale = ratingScale(items);
  const genres = new Tally<number>();
  const keywords = new Tally<number>();
  const cast = new Tally<number>();
  const directors = new Map<
    number,
    { name: string; sum: number; n: number; ratings: number[] }
  >();
  const languages = new Map<string, number>();
  const decades = new Map<number, number>();
  let likedTotal = 0;
  let movies = 0;
  let engaged = 0;
  const pop: Array<[number, number]> = [];
  const mine: number[] = [];
  const crowd: number[] = [];
  const seeds: Seed[] = [];
  const antiSeeds: Seed[] = [];

  for (const item of items) {
    const base = titleWeight(item, scale);
    const w = base * fade(item.updatedAt, now);
    const sig: TitleSignals | undefined =
      signals[signalKey(item.type, item.id)];
    const m = meta[metaKey(item)];
    const genreList =
      sig?.genres ??
      (m?.genres ?? [])
        .map((g) => genreIds.get(g))
        .filter((g): g is number => g !== undefined);
    // The watchlist only hints at genres; everything else counts fully.
    const gw = item.status === "watchlist" ? w * 0.5 : w;
    for (const g of genreList) genres.add(g, gw);
    if (item.status === "watchlist") continue;

    engaged += 1;
    if (item.type === "movie") movies += 1;
    if (sig) {
      for (const k of sig.keywords) keywords.add(k, w);
      for (const p of sig.cast.slice(0, 3)) cast.add(p, w);
      for (const d of sig.directors) {
        const row = directors.get(d.id) ?? {
          name: d.name,
          sum: 0,
          n: 0,
          ratings: [],
        };
        row.sum += w;
        row.n += 1;
        if (item.rating !== null) row.ratings.push(item.rating);
        directors.set(d.id, row);
      }
      if (item.rating !== null && sig.votes >= 50) {
        mine.push(item.rating);
        crowd.push(sig.vote);
      }
    }
    if (w > 0.2) {
      likedTotal += w;
      const lang = sig?.language;
      if (lang && lang !== "en")
        languages.set(lang, (languages.get(lang) ?? 0) + w);
      const year =
        sig?.year || Number((m?.date || item.year || "").slice(0, 4));
      if (year) {
        const decade = Math.floor(year / 10) * 10;
        decades.set(decade, (decades.get(decade) ?? 0) + w);
      }
      if (sig && sig.votes > 0) pop.push([Math.log10(sig.votes), w]);
    }
    const seed: Seed = {
      type: item.type,
      id: item.id,
      title: item.title,
      rating: item.rating,
      weight: base,
    };
    if (sig?.recs.length) {
      if (base >= 0.3) seeds.push(seed);
      else if (base <= -0.35) antiSeeds.push(seed);
    }
  }

  const topDecade = Math.max(0, ...decades.values());
  const directorMap = new Map<number, Director>();
  for (const [id, row] of directors)
    directorMap.set(id, {
      name: row.name,
      n: row.n,
      score: clamp(row.sum / (row.n + 0.6)),
      avg: row.ratings.length
        ? row.ratings.reduce((a, b) => a + b, 0) / row.ratings.length
        : 0,
    });
  const popWeight = pop.reduce((a, [, w]) => a + w, 0);

  return {
    engaged,
    rated: scale.rated,
    mean: scale.mean,
    spread: scale.spread,
    followsCrowd: pearson(mine, crowd),
    genres: genres.shrunk(2),
    keywords: keywords.shrunk(1.5),
    directors: directorMap,
    cast: cast.shrunk(1.5),
    languages: new Map(
      [...languages].map(([k, v]) => [k, likedTotal ? v / likedTotal : 0]),
    ),
    decades: new Map(
      [...decades].map(([k, v]) => [k, topDecade ? v / topDecade : 0]),
    ),
    movieShare: engaged ? movies / engaged : 0.5,
    mainstream: popWeight
      ? pop.reduce((a, [l, w]) => a + l * w, 0) / popWeight
      : null,
    seeds: seeds.sort((a, b) => b.weight - a.weight),
    antiSeeds,
  };
}

const top = <K>(map: Map<K, number>, n: number, min = 0.15) =>
  [...map]
    .filter(([, v]) => v >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

export const topGenres = (p: Profile, n = 3) => top(p.genres, n);
export const topKeywords = (p: Profile, n = 4) => top(p.keywords, n, 0.2);
export const favouriteDirectors = (p: Profile, n = 3) =>
  [...p.directors]
    .filter(([, d]) => d.score >= 0.25 && d.n >= 1)
    .sort((a, b) => b[1].score - a[1].score || b[1].n - a[1].n)
    .slice(0, n);
export const favouriteLanguage = (p: Profile) =>
  [...p.languages].sort((a, b) => b[1] - a[1]).find(([, v]) => v >= 0.15)?.[0];
export const dislikedGenres = (p: Profile, n = 2) =>
  [...p.genres]
    .filter(([, v]) => v <= -0.15)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([k]) => k);
