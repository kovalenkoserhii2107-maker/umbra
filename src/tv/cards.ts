import type { LibraryItem } from "../lib/library";
import { SEARCH_GENRES } from "../lib/search";
import {
  correctPosterUrl,
  mediaOf,
  posterUrl,
  titleOf,
  type MediaType,
  type TmdbItem,
} from "../lib/tmdb";
import { yearOf } from "../lib/format";

/** One title on a TV row, and what the screen above it shows when focused. */
export type Card = {
  type: MediaType;
  id: number;
  title: string;
  poster: string | null;
  /** TMDB path; null when unknown yet (library items). */
  backdrop?: string | null;
  overview?: string;
  year?: string;
  vote?: number;
  genres?: string[];
  /** A short label on the poster: "S2E5", "18 дек". */
  badge?: string;
};

export type CardRow = { key: string; title: string; cards: Card[] };

const GENRES = new Map<number, string>(
  SEARCH_GENRES.map((g) => [g.id, g.label]),
);
// TV genres that have no film twin.
GENRES.set(10759, "Боевик");
GENRES.set(10765, "Фантастика");
GENRES.set(10768, "Война");
GENRES.set(10762, "Детям");
GENRES.set(10764, "Реалити");
GENRES.set(10767, "Ток-шоу");

export function fromTmdb(item: TmdbItem, type?: MediaType): Card | null {
  if (item.media_type === "person") return null;
  const genres = (item.genre_ids ?? [])
    .map((id) => GENRES.get(id))
    .filter((g): g is string => Boolean(g));
  return {
    type: mediaOf(item, type),
    id: item.id,
    title: titleOf(item),
    poster: posterUrl(item.poster_path) || null,
    backdrop: item.backdrop_path ?? null,
    overview: item.overview || undefined,
    year: yearOf(item.release_date || item.first_air_date) || undefined,
    vote: item.vote_count ? item.vote_average : undefined,
    genres: [...new Set(genres)].slice(0, 3),
  };
}

export function fromLibrary(item: LibraryItem, badge?: string): Card {
  return {
    type: item.type,
    id: item.id,
    title: item.title,
    poster: item.poster
      ? correctPosterUrl(item.poster).replace(/\/w\d+\//, "/w342/")
      : null,
    backdrop: undefined,
    year: item.year || undefined,
    badge,
  };
}

/** Cards of a row without repeats (TMDB lists overlap between pages). */
export function cardsOf(items: TmdbItem[], type?: MediaType): Card[] {
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const item of items) {
    const card = fromTmdb(item, type);
    if (!card) continue;
    const key = `${card.type}-${card.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}

/** "2021 · фільм · ★ 7.8 · Фантастика, Драма" */
export function metaLine(card: Card, imdb?: string | null) {
  return [
    card.year,
    card.type === "tv" ? "серіал" : "фільм",
    imdb ? `IMDb ${imdb}` : card.vote ? `★ ${card.vote.toFixed(1)}` : null,
    card.genres?.length ? card.genres.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
