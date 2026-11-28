import type { MediaType, TmdbItem } from "../tmdb";
import { MOODS, keyOf, type Answers, type Pick } from "../tonight";
import type { Profile, Seed } from "./profile";

/** Where a candidate came from; one title can come from several places. */
export type Source =
  | "seed"
  | "watchlist"
  | "best"
  | "genres"
  | "gems"
  | "keywords"
  | "director"
  | "language";

export type EngineCandidate = {
  type: MediaType;
  item: TmdbItem;
  sources: Set<Source>;
  /** Liked titles that recommend it, with its place in their list. */
  seeds: Array<{ seed: Seed; rank: number }>;
  /** Disliked titles that recommend it. */
  anti: Array<{ seed: Seed; rank: number }>;
  director?: number;
  runtime?: number;
};

export class CandidatePool {
  readonly byKey = new Map<string, EngineCandidate>();
  add(
    type: MediaType,
    item: TmdbItem,
    source: Source,
    extra: {
      seed?: Seed;
      anti?: Seed;
      rank?: number;
      director?: number;
      runtime?: number;
    } = {},
  ) {
    const key = keyOf(type, item.id);
    const c = this.byKey.get(key) ?? {
      type,
      item,
      sources: new Set<Source>(),
      seeds: [],
      anti: [],
    };
    // Discover answers carry the overview; recommendations sometimes not.
    if (!c.item.overview && item.overview) c.item = { ...c.item, ...item };
    c.sources.add(source);
    if (extra.seed) c.seeds.push({ seed: extra.seed, rank: extra.rank ?? 0 });
    if (extra.anti) c.anti.push({ seed: extra.anti, rank: extra.rank ?? 0 });
    if (extra.director) c.director = extra.director;
    if (extra.runtime) c.runtime = extra.runtime;
    this.byKey.set(key, c);
  }
  get list() {
    return [...this.byKey.values()];
  }
}

/** Ukrainian genre names by TMDB id (films and series). */
export const GENRE_UK: Record<number, string> = {
  28: "бойовик",
  12: "пригоди",
  16: "анімація",
  35: "комедія",
  80: "кримінал",
  99: "документальне",
  18: "драма",
  10751: "сімейне",
  14: "фентезі",
  36: "історія",
  27: "жахи",
  10402: "музика",
  9648: "детектив",
  10749: "мелодрама",
  878: "фантастика",
  10770: "телефільм",
  53: "трилер",
  10752: "війна",
  37: "вестерн",
  10759: "екшн і пригоди",
  10762: "дитяче",
  10763: "новини",
  10764: "реаліті",
  10765: "фантастика й фентезі",
  10766: "мильна опера",
  10767: "ток-шоу",
  10768: "війна й політика",
};

/** "Корейське кіно" and the like, for the reasons. */
export const LANG_UK: Record<string, string> = {
  ko: "Корейське",
  ja: "Японське",
  fr: "Французьке",
  es: "Іспанське",
  it: "Італійське",
  de: "Німецьке",
  uk: "Українське",
  sv: "Шведське",
  da: "Данське",
  no: "Норвезьке",
  fi: "Фінське",
  is: "Ісландське",
  zh: "Китайське",
  cn: "Китайське",
  hi: "Індійське",
  tr: "Турецьке",
  pl: "Польське",
  pt: "Португальське",
};

/** Film genre → its series counterpart and back, for queries and taste. */
const TV_OF: Record<number, number> = {
  878: 10765,
  14: 10765,
  28: 10759,
  12: 10759,
  10752: 10768,
  53: 9648,
  27: 9648,
};
const MOVIE_OF: Record<number, number> = {
  10765: 878,
  10759: 28,
  10768: 10752,
};
const TV_ONLY = new Set([
  10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768,
]);
const MOVIE_ONLY = new Set([
  28, 12, 14, 36, 27, 10402, 10749, 878, 10770, 53, 10752,
]);

export function genreFor(id: number, type: MediaType): number | null {
  if (type === "tv") return MOVIE_ONLY.has(id) ? (TV_OF[id] ?? null) : id;
  return TV_ONLY.has(id) ? (MOVIE_OF[id] ?? null) : id;
}

/** How much the person likes a genre, reading series genres as film ones too. */
function affinity(p: Profile, id: number, type: MediaType) {
  const direct = p.genres.get(id);
  if (direct !== undefined) return direct;
  const other = genreFor(id, type === "tv" ? "movie" : "tv");
  return other !== null ? (p.genres.get(other) ?? 0) : 0;
}

export const FAMILY_BLOCK = [27, 53, 80, 10752];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const year = (item: TmdbItem) =>
  Number((item.release_date || item.first_air_date || "").slice(0, 4)) || 0;
const dateOf = (item: TmdbItem) =>
  (item.release_date || item.first_air_date || "").slice(0, 10);

/** Weighted rating: few votes pull a score towards the average. */
export function bayesian(item: TmdbItem) {
  const v = item.vote_count ?? 0;
  const r = item.vote_average ?? 0;
  const m = 250;
  const c = 6.6;
  return (v * r + m * c) / (v + m);
}

export type Scored = Pick & {
  quality: number;
  genres: number[];
  seedIds: string[];
  director?: number;
};

type Context = {
  seen: Set<string>;
  random: () => number;
  /** Today, YYYY-MM-DD; used for "new". */
  today: string;
};

function yearsBefore(today: string, n: number) {
  return `${Number(today.slice(0, 4)) - n}${today.slice(4)}`;
}

/**
 * Scores every candidate for tonight. Quality leads (a weighted rating that
 * matters more for people whose ratings follow the crowd), then how well it
 * fits the taste: genres, what liked titles lead to, the director, the
 * language, the era, how mainstream it is. Dislikes pull down. With little
 * history the audience's opinion carries more weight.
 */
export function scoreCandidates(
  candidates: EngineCandidate[],
  p: Profile,
  a: Answers,
  ctx: Context,
): Scored[] {
  const mood = MOODS.find((m) => m.id === a.mood);
  const types: MediaType[] =
    a.format === "tv"
      ? ["tv"]
      : a.format === "any"
        ? ["movie", "tv"]
        : ["movie"];
  const confidence = Math.min(1, p.engaged / 10);
  const qualityWeight =
    0.3 + 0.12 * Math.max(0, p.followsCrowd) + 0.15 * (1 - confidence);
  const out: Scored[] = [];

  for (const c of candidates) {
    const key = keyOf(c.type, c.item.id);
    if (!types.includes(c.type) || ctx.seen.has(key)) continue;
    const watchlist = c.sources.has("watchlist");
    if (!watchlist && (c.item.vote_count ?? 0) < 30) continue;
    const ids = c.item.genre_ids ?? [];
    if (a.company === "family" && ids.some((g) => FAMILY_BLOCK.includes(g)))
      continue;
    const date = dateOf(c.item);
    if (date && date > ctx.today) continue;
    if (date && a.era === "new" && date < yearsBefore(ctx.today, 3)) continue;
    if (date && a.era === "classic" && date > "2005-12-31") continue;
    if (a.format === "short") {
      // Only what is known to be short: discover asked for it.
      const fromDiscover = [...c.sources].some(
        (s) => s !== "seed" && s !== "watchlist",
      );
      if (c.runtime ? c.runtime > 100 : !fromDiscover) continue;
    }
    const moodIds = mood ? (c.type === "tv" ? mood.tv : mood.movie) : [];
    const moodHits = moodIds.length
      ? ids.filter((g) => moodIds.includes(g)).length
      : 0;
    if (moodIds.length && !moodHits) continue;

    // Quality.
    const votes = c.item.vote_count ?? 0;
    const bayes = votes ? bayesian(c.item) : 0;
    const quality = votes ? clamp01((bayes - 5.8) / 2.8) : 0.55;

    // Genres: the best one matters most; a disliked one pulls down.
    const aff = ids.map((g) => affinity(p, g, c.type));
    const g = aff.length
      ? 0.6 * Math.max(...aff) +
        0.4 * (aff.reduce((x, y) => x + y, 0) / aff.length)
      : 0;
    const worst = aff.length ? Math.min(0, ...aff) : 0;

    // What liked titles lead to, and disliked ones.
    const cfSum = c.seeds.reduce(
      (s, { seed, rank }) => s + seed.weight * Math.max(0.2, 1 - rank / 16),
      0,
    );
    const cf = 1 - Math.exp(-1.3 * cfSum);
    const antiSum = c.anti.reduce(
      (s, { seed, rank }) =>
        s + Math.abs(seed.weight) * Math.max(0.2, 1 - rank / 16),
      0,
    );
    const anti = 1 - Math.exp(-1.3 * antiSum);

    const dir = c.director ? p.directors.get(c.director) : undefined;
    const d = dir ? clamp01(dir.score) : 0;
    const k = c.sources.has("keywords") ? 0.6 : 0;

    const lang = c.item.original_language;
    const share = lang && lang !== "en" ? (p.languages.get(lang) ?? 0) : 0;
    const l =
      lang && lang !== "en"
        ? share
          ? clamp01(share * 2.5)
          : p.engaged >= 8
            ? -0.1
            : 0
        : 0;

    const decade = Math.floor(year(c.item) / 10) * 10;
    const e = p.decades.size ? (p.decades.get(decade) ?? 0) : 0.3;
    const t =
      a.format === "any"
        ? (c.type === "movie" ? p.movieShare : 1 - p.movieShare) - 0.5
        : 0;
    const mainstream =
      p.mainstream === null || !votes
        ? 0.5
        : 1 - Math.min(1, Math.abs(Math.log10(votes + 1) - p.mainstream) / 1.5);
    const popularity = clamp01(Math.log10((c.item.popularity ?? 0) + 1) / 3);

    let company = 0;
    if (a.company === "couple" && ids.includes(10749)) company = 0.04;
    if (
      a.company === "friends" &&
      ids.some((x) => [35, 28, 27, 10759].includes(x))
    )
      company = 0.03;
    if (a.company === "family" && ids.some((x) => [10751, 16].includes(x)))
      company = 0.05;

    const score =
      qualityWeight * quality +
      confidence *
        (0.22 * g +
          0.2 * cf +
          0.07 * d +
          0.05 * k +
          0.04 * l +
          0.03 * e +
          0.04 * mainstream +
          0.03 * t +
          0.5 * worst -
          0.25 * anti) +
      (1 - confidence) * 0.1 * popularity +
      (watchlist ? 0.12 : 0) +
      (moodIds.length ? 0.08 * (Math.min(moodHits, 2) / 2) : 0) +
      company -
      (c.item.poster_path || watchlist ? 0 : 0.03) +
      (ctx.random() - 0.5) * 0.05;

    const personal = clamp01(
      0.45 +
        0.35 * g +
        0.3 * cf +
        0.15 * d +
        0.1 * l +
        0.05 * e +
        0.1 * (mainstream - 0.5) +
        0.3 * worst -
        0.4 * anti,
    );

    out.push({
      key,
      type: c.type,
      item: c.item,
      score,
      quality,
      match: confidence >= 0.3 ? Math.round(55 + 44 * personal) : undefined,
      reasons: reasonsFor(c, p, { g, cf, d, l, e, bayes, votes, aff, ids }),
      genres: ids,
      seedIds: c.seeds.map(({ seed }) => keyOf(seed.type, seed.id)),
      director: c.director,
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

function reasonsFor(
  c: EngineCandidate,
  p: Profile,
  f: {
    g: number;
    cf: number;
    d: number;
    l: number;
    e: number;
    bayes: number;
    votes: number;
    aff: number[];
    ids: number[];
  },
): string[] {
  const out: Array<[number, string]> = [];
  if (c.sources.has("watchlist")) out.push([1.2, "із твого «Хочу подивитися»"]);
  const seeds = [...c.seeds]
    .sort((x, y) => y.seed.weight - x.seed.weight)
    .map((s) => s.seed)
    .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i);
  if (seeds.length >= 2)
    out.push([
      0.4 + f.cf,
      `після «${seeds[0].title}» і «${seeds[1].title}», які тобі сподобалися`,
    ]);
  else if (seeds.length)
    out.push([
      0.3 + f.cf,
      seeds[0].rating !== null
        ? `схоже на «${seeds[0].title}» — твоя ${seeds[0].rating}/10`
        : `схоже на «${seeds[0].title}»`,
    ]);
  const dir = c.director ? p.directors.get(c.director) : undefined;
  if (dir)
    out.push([
      0.5 + f.d,
      `${c.type === "tv" ? "автор" : "режисер"} ${dir.name}: ${
        dir.avg
          ? `твої оцінки його робіт у середньому ${dir.avg.toFixed(1)}`
          : "ти любиш його роботи"
      }`,
    ]);
  const loved = f.ids
    .map((id, i) => [id, f.aff[i]] as const)
    .filter(([id, v]) => v >= 0.25 && GENRE_UK[id])
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([id]) => GENRE_UK[id]);
  if (loved.length) out.push([0.3 + f.g, `твоє: ${loved.join(" + ")}`]);
  const vote = c.item.vote_average ?? 0;
  if (f.votes >= 100 && f.votes <= 1500 && vote >= 7.5)
    out.push([0.65, `прихована перлина: ★ ${vote.toFixed(1)}, мало хто бачив`]);
  else if (f.bayes >= 8)
    out.push([
      0.7,
      `глядачі в захваті: ★ ${vote.toFixed(1)} від ${
        f.votes >= 1000 ? `${Math.round(f.votes / 1000)} тис.` : f.votes
      } людей`,
    ]);
  const lang = c.item.original_language;
  if (f.l >= 0.3 && lang && LANG_UK[lang])
    out.push([0.35 + f.l * 0.5, `${LANG_UK[lang]} кіно — ти таке цінуєш`]);
  const y = year(c.item);
  if (f.e >= 0.85 && y && y < 2010)
    out.push([0.4, `твоя епоха: ${Math.floor(y / 10) * 10}-ті`]);
  if (c.sources.has("keywords") && out.length < 2)
    out.push([0.3, "теми, які тебе чіпляють"]);
  return out
    .sort((x, y) => y[0] - x[0])
    .slice(0, 3)
    .map(([, text]) => text);
}

const jaccard = (a: number[], b: number[]) => {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (a.length + b.length - inter);
};

function similarity(a: Scored, b: Scored) {
  const seed = a.seedIds.some((s) => b.seedIds.includes(s)) ? 1 : 0;
  const director = a.director && a.director === b.director ? 1 : 0;
  return 0.55 * jaccard(a.genres, b.genres) + 0.25 * seed + 0.2 * director;
}

/**
 * A varied list: each next title is the best one that is not too much like
 * those already chosen (maximal marginal relevance). Then each page of six
 * is ordered from the highest score down.
 */
export function diversify(
  scored: Scored[],
  size = 60,
  page = 6,
  lambda = 0.12,
) {
  const pool = scored.slice(0, 150);
  const chosen: Scored[] = [];
  while (pool.length && chosen.length < size) {
    let best = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const sim = chosen.length
        ? Math.max(...chosen.map((c) => similarity(c, pool[i])))
        : 0;
      const value = pool[i].score - lambda * sim;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    chosen.push(pool.splice(best, 1)[0]);
  }
  const out: Scored[] = [];
  for (let i = 0; i < chosen.length; i += page)
    out.push(...chosen.slice(i, i + page).sort((x, y) => y.score - x.score));
  return out;
}

/** A repeatable random sequence: the same seed, the same evening. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
