import type { LibraryItem } from "./library";
import { metaKey, type MetaMap } from "./meta";
import { yearOf } from "./format";
import {
  posterUrl,
  tmdb,
  titleOf,
  type MediaType,
  type TmdbItem,
} from "./tmdb";

/**
 * "What to watch tonight": a few answers plus everything the player has
 * marked and rated pick the titles that fit the evening best.
 */

export type Mood =
  "any" | "laugh" | "thrill" | "think" | "cozy" | "action" | "wonder" | "touch";
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
  {
    id: "any",
    label: "Довірюся смаку",
    hint: "за моїми оцінками",
    movie: [],
    tv: [],
  },
  { id: "laugh", label: "Посміятися", hint: "комедії", movie: [35], tv: [35] },
  {
    id: "thrill",
    label: "Лоскотати нерви",
    hint: "трилери, горори, детективи",
    movie: [53, 27, 9648],
    tv: [9648, 80],
  },
  {
    id: "think",
    label: "Подумати",
    hint: "драми, загадки, історія",
    movie: [18, 9648, 36, 99],
    tv: [18, 9648, 99],
  },
  {
    id: "cozy",
    label: "Затишно і легко",
    hint: "романтика, сімейне, мультфільми",
    movie: [10749, 10751, 16, 35],
    tv: [35, 10751, 16],
  },
  {
    id: "action",
    label: "Драйв і екшн",
    hint: "бойовики, пригоди",
    movie: [28, 12, 80],
    tv: [10759, 80],
  },
  {
    id: "wonder",
    label: "Фантазія і космос",
    hint: "фантастика, фентезі",
    movie: [878, 14, 12],
    tv: [10765],
  },
  {
    id: "touch",
    label: "Щоб зворушило",
    hint: "сильні драми, мелодрами",
    movie: [18, 10749],
    tv: [18],
  },
];

export const FORMATS: Array<{ id: Format; label: string; hint: string }> = [
  { id: "short", label: "Фільм до 1,5 години", hint: "щоб не засиджуватися" },
  { id: "movie", label: "Фільм будь-якої тривалості", hint: "" },
  { id: "tv", label: "Серіал", hint: "пара серій" },
  { id: "any", label: "Байдуже", hint: "" },
];

export const COMPANIES: Array<{ id: Company; label: string }> = [
  { id: "solo", label: "Один" },
  { id: "couple", label: "Удвох" },
  { id: "friends", label: "З друзями" },
  { id: "family", label: "Із сім'єю та дітьми" },
];

export const ERAS: Array<{ id: Era; label: string }> = [
  { id: "new", label: "Щось свіже" },
  { id: "classic", label: "Перевірена класика" },
  { id: "any", label: "Байдуже" },
];

export type Pick = {
  key: string;
  type: MediaType;
  item: TmdbItem;
  score: number;
  reasons: string[];
  /** How well it fits the person's taste, percent. */
  match?: number;
  /** My streaming services that have it, e.g. ["Netflix"]. */
  where?: string[];
};

export const keyOf = (type: MediaType, id: number) => `${type}:${id}`;

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
      (!wanted.size ||
        (meta[metaKey(x)]?.genres ?? []).some((g) => wanted.has(g))),
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

/** A pick as a library entry: "want to watch" unless told otherwise. */
export function watchlistEntry(
  p: Pick,
  status: LibraryItem["status"] = "watchlist",
) {
  return {
    id: p.item.id,
    type: p.type,
    title: titleOf(p.item),
    poster: posterUrl(p.item.poster_path, "w185"),
    year: yearOf(p.item.release_date || p.item.first_air_date),
    status,
    rating: null,
    note: "",
  };
}
