import type { LibraryItem } from "./library";
import { metaKey, type MetaMap } from "./meta";
import { tmdb, titleOf, type MediaType, type TmdbItem } from "./tmdb";

/**
 * "What to watch tonight": a few answers plus everything the player has
 * marked and rated pick the titles that fit the evening best.
 */

export type Mood =
  "laugh" | "thrill" | "think" | "cozy" | "action" | "wonder" | "touch";
export type Format = "short" | "movie" | "tv" | "any";
export type Company = "solo" | "couple" | "family" | "friends";
export type Era = "new" | "classic" | "any";

export type Answers = {
  mood: Mood;
  format: Format;
  company: Company;
  era: Era;
  /** Only what is on my streaming services in my country. */
  mine: boolean;
};

/** TMDB genre ids per mood; "|" in discover means "any of". */
export const MOODS: Array<{
  id: Mood;
  label: string;
  hint: string;
  movie: number[];
  tv: number[];
}> = [
  { id: "laugh", label: "Посмеяться", hint: "комедии", movie: [35], tv: [35] },
  {
    id: "thrill",
    label: "Пощекотать нервы",
    hint: "триллеры, хорроры, детективы",
    movie: [53, 27, 9648],
    tv: [9648, 80],
  },
  {
    id: "think",
    label: "Подумать",
    hint: "драмы, загадки, история",
    movie: [18, 9648, 36, 99],
    tv: [18, 9648, 99],
  },
  {
    id: "cozy",
    label: "Уютно и легко",
    hint: "романтика, семейное, мультфильмы",
    movie: [10749, 10751, 16, 35],
    tv: [35, 10751, 16],
  },
  {
    id: "action",
    label: "Драйв и экшен",
    hint: "боевики, приключения",
    movie: [28, 12, 80],
    tv: [10759, 80],
  },
  {
    id: "wonder",
    label: "Фантазия и космос",
    hint: "фантастика, фэнтези",
    movie: [878, 14, 12],
    tv: [10765],
  },
  {
    id: "touch",
    label: "Чтобы тронуло",
    hint: "сильные драмы, мелодрамы",
    movie: [18, 10749],
    tv: [18],
  },
];

export const FORMATS: Array<{ id: Format; label: string; hint: string }> = [
  { id: "short", label: "Фильм до 1,5 часа", hint: "чтобы не засидеться" },
  { id: "movie", label: "Фильм любой длины", hint: "" },
  { id: "tv", label: "Сериал", hint: "пара серий" },
  { id: "any", label: "Неважно", hint: "" },
];

export const COMPANIES: Array<{ id: Company; label: string }> = [
  { id: "solo", label: "Один" },
  { id: "couple", label: "Вдвоём" },
  { id: "friends", label: "С друзьями" },
  { id: "family", label: "С семьёй и детьми" },
];

export const ERAS: Array<{ id: Era; label: string }> = [
  { id: "new", label: "Что-то свежее" },
  { id: "classic", label: "Проверенная классика" },
  { id: "any", label: "Неважно" },
];

/** Never offered to a family evening. */
const FAMILY_BLOCK = [27, 53, 80, 10752];

export type Candidate = {
  item: TmdbItem;
  type: MediaType;
  /** Where it came from, for the reasons shown on the card. */
  from: "watchlist" | "similar" | "discover";
  /** The loved title it is similar to. */
  like?: { title: string; rating: number };
  /** Genre names, when known (watchlist titles come with names only). */
  genres?: string[];
  runtime?: number;
};

export type Pick = {
  key: string;
  type: MediaType;
  item: TmdbItem;
  score: number;
  reasons: string[];
  /** My streaming services that have it, e.g. ["Netflix"]. */
  where?: string[];
};

export const keyOf = (type: MediaType, id: number) => `${type}:${id}`;

const typesFor = (format: Format): MediaType[] =>
  format === "tv" ? ["tv"] : format === "any" ? ["movie", "tv"] : ["movie"];

/**
 * How much the player likes each genre, from -1 to 1: the average of their
 * ratings against 6.5, trusted more with more ratings.
 */
export function genreTaste(items: LibraryItem[], meta: MetaMap) {
  const sum = new Map<string, { total: number; n: number }>();
  for (const x of items) {
    if (x.rating === null) continue;
    for (const g of meta[metaKey(x)]?.genres ?? []) {
      const row = sum.get(g) ?? { total: 0, n: 0 };
      row.total += x.rating;
      row.n++;
      sum.set(g, row);
    }
  }
  const taste = new Map<string, number>();
  for (const [g, { total, n }] of sum)
    taste.set(
      g,
      Math.max(-1, Math.min(1, ((total / n - 6.5) / 3.5) * Math.min(1, n / 3))),
    );
  return taste;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Scores candidates and keeps the best, one entry per title. */
export function rankTonight(
  candidates: Candidate[],
  answers: Answers,
  ctx: {
    seen: Set<string>;
    taste: Map<string, number>;
    names: Map<number, string>;
  },
): Pick[] {
  const mood = MOODS.find((m) => m.id === answers.mood)!;
  const best = new Map<string, Pick>();
  const types = typesFor(answers.format);
  for (const c of candidates) {
    if (!types.includes(c.type)) continue;
    const key = keyOf(c.type, c.item.id);
    if (ctx.seen.has(key)) continue;
    const ids = c.item.genre_ids ?? [];
    const names =
      c.genres ?? ids.map((id) => ctx.names.get(id)).filter(Boolean);
    const moodIds = c.type === "tv" ? mood.tv : mood.movie;
    const moodNames = new Set(
      moodIds.map((id) => ctx.names.get(id)).filter(Boolean),
    );
    const matches = ids.length
      ? ids.filter((id) => moodIds.includes(id)).length
      : (names as string[]).filter((n) => moodNames.has(n)).length;
    if (!matches) continue;
    if (
      answers.company === "family" &&
      ids.some((id) => FAMILY_BLOCK.includes(id))
    )
      continue;
    if (answers.format === "short" && c.runtime && c.runtime > 100) continue;
    const date = c.item.release_date || c.item.first_air_date || "";
    if (date && answers.era === "new" && date < yearsAgo(3)) continue;
    if (date && answers.era === "classic" && date > "2005-12-31") continue;

    const votes = c.item.vote_count ?? 0;
    const quality =
      votes >= 50 ? clamp(((c.item.vote_average ?? 0) - 5.5) / 3.5) : 0.3;
    const popularity = clamp(Math.log10((c.item.popularity ?? 1) + 1) / 3);
    const tastes = (names as string[])
      .map((n) => ctx.taste.get(n))
      .filter((t): t is number => t !== undefined);
    const taste = tastes.length
      ? tastes.reduce((a, b) => a + b, 0) / tastes.length
      : 0;
    let company = 0;
    if (answers.company === "couple" && ids.includes(10749)) company = 0.3;
    if (
      answers.company === "friends" &&
      ids.some((id) => [35, 28, 27].includes(id))
    )
      company = 0.2;
    if (
      answers.company === "family" &&
      ids.some((id) => [10751, 16].includes(id))
    )
      company = 0.3;
    const bonus = c.from === "watchlist" ? 0.7 : c.from === "similar" ? 0.4 : 0;
    const score =
      Math.min(matches, 2) * 0.6 +
      quality +
      popularity * 0.4 +
      taste * 0.8 +
      company +
      bonus;

    const reasons: string[] = [];
    if (c.from === "watchlist") reasons.push("из «Хочу посмотреть»");
    if (c.like)
      reasons.push(`похоже на «${c.like.title}» — твоя ${c.like.rating}/10`);
    const loved = (names as string[]).find(
      (n) => (ctx.taste.get(n) ?? 0) > 0.3,
    );
    if (loved && reasons.length < 2)
      reasons.push(`ты высоко ценишь жанр «${loved.toLowerCase()}»`);
    if (votes >= 50 && (c.item.vote_average ?? 0) >= 7.5 && reasons.length < 2)
      reasons.push(`зрители ставят ${c.item.vote_average!.toFixed(1)}`);

    const prev = best.get(key);
    if (!prev || prev.score < score)
      best.set(key, {
        key,
        type: c.type,
        item: c.item,
        score,
        reasons: prev
          ? [...new Set([...reasons, ...prev.reasons])].slice(0, 2)
          : reasons.slice(0, 2),
      });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------ loading */

const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

function discoverParams(
  type: MediaType,
  a: Answers,
  ids: number[],
  sort: "popularity.desc" | "vote_average.desc",
  region: string,
  services: number[],
) {
  const date = type === "movie" ? "primary_release_date" : "first_air_date";
  const p: Record<string, string | number | undefined> = {
    with_genres: ids.join("|"),
    sort_by: sort,
    "vote_count.gte":
      sort === "vote_average.desc" ? (type === "movie" ? 800 : 300) : 100,
    [`${date}.lte`]: today(),
  };
  if (a.era === "new") p[`${date}.gte`] = yearsAgo(3);
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

/** Everything that could fit tonight: watchlist, titles like loved ones, discover. */
export async function loadCandidates(
  a: Answers,
  items: LibraryItem[],
  meta: MetaMap,
  region: string,
  services: number[],
) {
  const mood = MOODS.find((m) => m.id === a.mood)!;
  const types = typesFor(a.format);
  const candidates: Candidate[] = [];

  for (const x of items)
    if (x.status === "watchlist" && types.includes(x.type)) {
      const m = meta[metaKey(x)];
      candidates.push({
        type: x.type,
        from: "watchlist",
        genres: m?.genres,
        runtime: x.type === "movie" ? m?.runtime : undefined,
        item: {
          id: x.id,
          title: x.title,
          poster_path: x.poster.match(/\/t\/p\/w\d+(\/.+)$/)?.[1] ?? null,
          release_date: m?.date || (x.year ? `${x.year}-01-01` : ""),
          media_type: x.type,
        },
      });
    }

  // Titles similar to the best-rated ones in the same mood.
  const moodNames = new Set<string>();
  const names = new Map<number, string>();
  for (const t of types)
    for (const g of (await tmdb.genres(t).catch(() => ({ genres: [] })))
      .genres) {
      names.set(g.id, g.name);
      if ((t === "tv" ? mood.tv : mood.movie).includes(g.id))
        moodNames.add(g.name);
    }
  const loved = items
    .filter(
      (x) =>
        (x.rating ?? 0) >= 8 &&
        types.includes(x.type) &&
        (meta[metaKey(x)]?.genres ?? []).some((g) => moodNames.has(g)),
    )
    .sort(
      (x, y) => (y.rating ?? 0) - (x.rating ?? 0) || y.updatedAt - x.updatedAt,
    )
    .slice(0, 4);

  const jobs: Array<Promise<void>> = loved.map((x) =>
    tmdb
      .recommendations(x.type, x.id)
      .then((page) => {
        for (const item of page.results.slice(0, 12))
          candidates.push({
            item,
            type: x.type,
            from: "similar",
            like: { title: x.title, rating: x.rating! },
          });
      })
      .catch(() => undefined),
  );
  for (const t of types) {
    const ids = t === "tv" ? mood.tv : mood.movie;
    for (const sort of ["popularity.desc", "vote_average.desc"] as const)
      jobs.push(
        tmdb
          .discoverBy(t, discoverParams(t, a, ids, sort, region, services))
          .then((page) => {
            for (const item of page.results)
              candidates.push({ item, type: t, from: "discover" });
          })
          .catch(() => undefined),
      );
  }
  await Promise.all(jobs);
  return { candidates, names };
}

/** Shows in progress that fit the mood: the easiest choice of all. */
export function continueShows(
  items: LibraryItem[],
  meta: MetaMap,
  a: Answers,
  names: Map<number, string>,
) {
  if (a.format !== "tv" && a.format !== "any") return [];
  const mood = MOODS.find((m) => m.id === a.mood)!;
  const wanted = new Set(mood.tv.map((id) => names.get(id)).filter(Boolean));
  return items.filter(
    (x) =>
      x.type === "tv" &&
      x.status === "watching" &&
      (meta[metaKey(x)]?.genres ?? []).some((g) => wanted.has(g)),
  );
}

export const pickTitle = (p: Pick) => titleOf(p.item);

/**
 * Adds where each pick streams on my services, checking at most `maxChecks`
 * titles. With `strict`, picks that are not on my services are dropped.
 */
export async function withServices(
  picks: Pick[],
  region: string,
  services: Array<{ id: number; name: string }>,
  strict: boolean,
  limit: number,
  maxChecks = 48,
) {
  const out: Pick[] = [];
  const pool = picks.slice(0, Math.min(picks.length, maxChecks));
  for (let i = 0; i < pool.length && out.length < limit; i += 8) {
    const batch = await Promise.all(
      pool.slice(i, i + 8).map(async (p) => {
        if (p.where) return p;
        const data = await tmdb
          .watchProviders(p.type, p.item.id)
          .catch(() => null);
        const group = data?.results?.[region];
        const ids = new Set(
          [
            ...(group?.flatrate ?? []),
            ...(group?.free ?? []),
            ...(group?.ads ?? []),
          ].map((x) => x.provider_id),
        );
        return {
          ...p,
          where: services.filter((s) => ids.has(s.id)).map((s) => s.name),
        };
      }),
    );
    for (const p of batch) if (!strict || p.where?.length) out.push(p);
  }
  return out.slice(0, limit);
}
