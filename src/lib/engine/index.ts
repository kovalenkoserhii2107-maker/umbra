import type { LibraryItem } from "../library";
import { metaKey, type MetaMap } from "../meta";
import { tmdb, type MediaType, type TmdbItem } from "../tmdb";
import { MOODS, type Answers, type Pick } from "../tonight";
import {
  buildProfile,
  dislikedGenres,
  favouriteDirectors,
  favouriteLanguage,
  signalTitles,
  topGenres,
  topKeywords,
  type Profile,
} from "./profile";
import {
  CandidatePool,
  FAMILY_BLOCK,
  GENRE_UK,
  LANG_UK,
  diversify,
  genreFor,
  scoreCandidates,
  seeded,
  type Source,
} from "./score";
import { loadSignals, signalKey } from "./signals";

/*
 * Umbra's own evening picker, no AI needed.
 *
 * 1. Learn: a taste profile from every mark in the library (profile.ts),
 *    with keywords, directors and recommendations of the titles that say
 *    the most (signals.ts).
 * 2. Gather: candidates from several angles at once — what liked titles
 *    lead to, the best of the favourite genre pair, popular and hidden gems
 *    in those genres, favourite themes, directors and languages, and the
 *    watchlist. The evening's answers narrow every query.
 * 3. Score and vary: quality first, then fit (score.ts); a varied list with
 *    each page ordered from the best down.
 */

export type TasteSummary = {
  genres: string[];
  avoid: string[];
  directors: string[];
  language?: string;
  critic: string;
  format: string;
  rated: number;
  engaged: number;
};

export type EngineResult = {
  picks: Pick[];
  profile: Profile;
  summary: TasteSummary;
};

const today = () => new Date().toISOString().slice(0, 10);

function typesFor(format: Answers["format"]): MediaType[] {
  return format === "tv"
    ? ["tv"]
    : format === "any"
      ? ["movie", "tv"]
      : ["movie"];
}

/** Filters every discover query shares: the evening's answers. */
function baseParams(
  type: MediaType,
  a: Answers,
  region: string,
  services: number[],
  day: string,
) {
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const p: Record<string, string | number | undefined> = {
    [`${date}.lte`]: day,
  };
  if (a.era === "new")
    p[`${date}.gte`] = `${Number(day.slice(0, 4)) - 3}${day.slice(4)}`;
  if (a.era === "classic") p[`${date}.lte`] = "2005-12-31";
  if (a.format === "short" && type === "movie") p["with_runtime.lte"] = 100;
  if (a.company === "family") p.without_genres = FAMILY_BLOCK.join(",");
  if (a.mine && services.length) {
    p.with_watch_providers = services.join("|");
    p.watch_region = region;
    p.with_watch_monetization_types = "flatrate|free|ads";
  }
  return p;
}

/** The genres to search in: the mood's, ordered by taste, or the favourites. */
function searchGenres(p: Profile, a: Answers, type: MediaType): number[] {
  const mood = MOODS.find((m) => m.id === a.mood);
  const moodIds = mood ? (type === "tv" ? mood.tv : mood.movie) : [];
  const fit = (id: number) => p.genres.get(id) ?? 0;
  if (moodIds.length) return [...moodIds].sort((x, y) => fit(y) - fit(x));
  const out: number[] = [];
  for (const g of topGenres(p, 4)) {
    const id = genreFor(g, type);
    if (id !== null && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 3);
}

export function describeTaste(p: Profile): TasteSummary {
  const lang = favouriteLanguage(p);
  const critic = !p.engaged
    ? "Колекція порожня — поки підбираю найкраще за оцінками глядачів. Познач і оціни кілька фільмів, і добірка стане твоєю"
    : !p.rated
      ? "Оцінок ще немає — підбираю за тим, що ти дивився"
      : p.mean <= 6.3
        ? `Суворий критик: середня оцінка ${p.mean.toFixed(1)}`
        : p.mean >= 8
          ? `Щедрий на оцінки: середня ${p.mean.toFixed(1)}`
          : `Середня оцінка ${p.mean.toFixed(1)}`;
  return {
    genres: topGenres(p, 4)
      .map((g) => GENRE_UK[g])
      .filter(Boolean),
    avoid: dislikedGenres(p)
      .map((g) => GENRE_UK[g])
      .filter(Boolean),
    directors: favouriteDirectors(p, 3).map(([, d]) => d.name),
    language: lang && LANG_UK[lang] ? `${LANG_UK[lang]} кіно` : undefined,
    critic,
    format:
      p.engaged < 3
        ? ""
        : p.movieShare >= 0.7
          ? "Більше фільми"
          : p.movieShare <= 0.3
            ? "Більше серіали"
            : "І фільми, і серіали",
    rated: p.rated,
    engaged: p.engaged,
  };
}

export async function runEngine(opts: {
  answers: Answers;
  items: LibraryItem[];
  meta: MetaMap;
  region: string;
  services: number[];
  seen: Set<string>;
  /** Changes the evening: another seed, other titles near the top. */
  seed: number;
  day?: string;
}): Promise<EngineResult> {
  const { answers: a, items, meta, region, services, seen } = opts;
  const day = opts.day ?? today();
  const random = seeded(opts.seed);
  const types = typesFor(a.format);

  // 1. Learn.
  const genreIds = new Map<string, number>();
  const [signals] = await Promise.all([
    loadSignals(signalTitles(items, random)),
    ...(["movie", "tv"] as const).map((t) =>
      tmdb
        .genres(t)
        .then((r) => r?.genres?.forEach((g) => genreIds.set(g.name, g.id)))
        .catch(() => undefined),
    ),
  ]);
  const profile = buildProfile(items, meta, signals, genreIds);

  // 2. Gather.
  const pool = new CandidatePool();
  for (const seed of profile.seeds)
    signals[signalKey(seed.type, seed.id)]?.recs.forEach((item, rank) =>
      pool.add((item.media_type as MediaType) || seed.type, item, "seed", {
        seed,
        rank,
      }),
    );

  const jobs: Array<Promise<void>> = [];
  let unknown = 0;
  for (const x of items) {
    if (x.status !== "watchlist" || !types.includes(x.type)) continue;
    const m = meta[metaKey(x)];
    // Not described yet: ask TMDB, or the mood and length cannot be told.
    if (!m && unknown++ < 12)
      jobs.push(
        tmdb
          .basic(x.type, x.id)
          .then((d) => {
            const c = pool.byKey.get(`${x.type}:${x.id}`);
            if (!c) return;
            c.item = {
              ...c.item,
              genre_ids: (d.genres ?? []).map((g) => g.id),
              release_date:
                (d.release_date || d.first_air_date || "").slice(0, 10) ||
                c.item.release_date,
              vote_average: d.vote_average,
              vote_count: d.vote_count,
              original_language: d.original_language,
            };
            if (x.type === "movie" && d.runtime) c.runtime = d.runtime;
          })
          .catch(() => undefined),
      );
    pool.add(
      x.type,
      {
        id: x.id,
        title: x.type === "movie" ? x.title : undefined,
        name: x.type === "tv" ? x.title : undefined,
        poster_path: x.poster.match(/\/t\/p\/w\d+(\/.+)$/)?.[1] ?? null,
        release_date: m?.date || (x.year ? `${x.year}-01-01` : ""),
        genre_ids: (m?.genres ?? [])
          .map((g) => genreIds.get(g))
          .filter((g): g is number => g !== undefined),
        media_type: x.type,
      },
      "watchlist",
      { runtime: x.type === "movie" ? m?.runtime : undefined },
    );
  }

  const ask = (
    type: MediaType,
    source: Source,
    params: Record<string, string | number | undefined>,
    extra: { director?: number } = {},
  ) =>
    jobs.push(
      tmdb
        .discoverBy(type, {
          ...baseParams(type, a, region, services, day),
          ...params,
        })
        .then((page) => {
          for (const item of page.results as TmdbItem[])
            pool.add(type, item, source, extra);
        })
        .catch(() => undefined),
    );

  const keywords = topKeywords(profile);
  const directors = favouriteDirectors(profile, 2);
  const language = favouriteLanguage(profile);
  for (const type of types) {
    const genres = searchGenres(profile, a, type);
    const anyOf = genres.join("|") || undefined;
    const many = type === "movie" ? 500 : 200;
    // The best of the favourite pair: both genres at once.
    ask(type, "best", {
      with_genres: genres.length >= 2 ? genres.slice(0, 2).join(",") : anyOf,
      sort_by: "vote_average.desc",
      "vote_count.gte": many,
    });
    // Popular and good in any of the genres.
    ask(type, "genres", {
      with_genres: anyOf,
      sort_by: "popularity.desc",
      "vote_average.gte": 6.8,
      "vote_count.gte": 150,
    });
    // Hidden gems: loved by the few who saw them.
    ask(type, "gems", {
      with_genres: anyOf,
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.3,
      "vote_count.gte": 120,
      "vote_count.lte": 1500,
    });
    if (keywords.length)
      ask(type, "keywords", {
        with_keywords: keywords.join("|"),
        with_genres: a.mood !== "any" ? anyOf : undefined,
        sort_by: "vote_average.desc",
        "vote_count.gte": type === "movie" ? 200 : 80,
      });
    if (language)
      ask(type, "language", {
        with_original_language: language,
        with_genres: anyOf,
        sort_by: "vote_average.desc",
        "vote_count.gte": type === "movie" ? 100 : 40,
      });
    if (type === "movie")
      for (const [id] of directors)
        ask(
          type,
          "director",
          {
            with_crew: id,
            sort_by: "vote_average.desc",
            "vote_count.gte": 100,
          },
          { director: id },
        );
  }
  await Promise.all(jobs);
  // What disliked titles lead to counts against (marks, never adds).
  for (const anti of profile.antiSeeds)
    signals[signalKey(anti.type, anti.id)]?.recs.forEach((item, rank) => {
      const type = (item.media_type as MediaType) || anti.type;
      pool.byKey.get(`${type}:${item.id}`)?.anti.push({ seed: anti, rank });
    });

  // 3. Score and vary.
  const scored = scoreCandidates(pool.list, profile, a, {
    seen,
    random,
    today: day,
  });
  const picks: Pick[] = diversify(scored).map(
    ({ key, type, item, score, reasons, match }) => ({
      key,
      type,
      item,
      score,
      reasons,
      match,
    }),
  );
  return { picks, profile, summary: describeTaste(profile) };
}
