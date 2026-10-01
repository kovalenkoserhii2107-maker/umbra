import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../src/lib/library";
import {
  DEFAULT_FILTERS,
  filterCollection,
  filtersFromParams,
  paramsFromFilters,
} from "../../src/lib/collection";
import type { MetaMap } from "../../src/lib/meta";
import { watchedMinutes } from "../../src/lib/meta";
import { computeStats } from "../../src/lib/stats";
import { tasteMatch } from "../../src/lib/taste";
import {
  continueState,
  nextEpisode,
  previousEpisode,
} from "../../src/lib/tracking";

const item = (p: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  type: "movie",
  title: "A",
  poster: "",
  year: "2020",
  status: "watched",
  rating: null,
  note: "",
  updatedAt: 0,
  ...p,
});
const meta: MetaMap = {
  "movie:1": { genres: ["Драма"], runtime: 120, date: "2021-03-01", at: 1 },
  "movie:2": { genres: ["Комедия"], runtime: 90, date: "1995-01-01", at: 1 },
  "tv:3": {
    genres: ["Драма"],
    runtime: 50,
    date: "2015-01-01",
    seasons: [
      [1, 10],
      [2, 8],
    ],
    at: 1,
  },
};
const items = [
  item({ id: 1, title: "Бета", rating: 9, updatedAt: 3 }),
  item({ id: 2, title: "Альфа", rating: 6, updatedAt: 2 }),
  item({
    id: 3,
    type: "tv",
    title: "Сериал",
    status: "watching",
    season: 2,
    episode: 3,
    updatedAt: 1,
  }),
  item({
    id: 4,
    title: "Список",
    status: "watchlist",
    year: "2026",
    updatedAt: 4,
  }),
];

describe("collection filters", () => {
  it("combines status, type, genre, rating and decade", () => {
    const f = { ...DEFAULT_FILTERS };
    expect(
      filterCollection(items, { ...f, genre: "Драма" }, meta).map((x) => x.id),
    ).toEqual([1, 3]);
    expect(
      filterCollection(items, { ...f, type: "tv" }, meta).map((x) => x.id),
    ).toEqual([3]);
    expect(
      filterCollection(items, { ...f, rating: "9" }, meta).map((x) => x.id),
    ).toEqual([1]);
    expect(
      filterCollection(items, { ...f, rating: "none" }, meta).map((x) => x.id),
    ).toEqual([4, 3]);
    expect(
      filterCollection(items, { ...f, decade: "1990" }, meta).map((x) => x.id),
    ).toEqual([2]);
    expect(
      filterCollection(items, { ...f, q: "альф" }, meta).map((x) => x.id),
    ).toEqual([2]);
    expect(
      filterCollection(items, { ...f, sort: "title" }, meta).map(
        (x) => x.title,
      ),
    ).toEqual(["Альфа", "Бета", "Сериал", "Список"]);
  });

  it("round-trips through the URL and ignores unknown values", () => {
    const f = {
      ...DEFAULT_FILTERS,
      status: "watching" as const,
      genre: "Драма",
    };
    expect(filtersFromParams(paramsFromFilters(f))).toEqual(f);
    expect(
      filtersFromParams(new URLSearchParams("status=hacked&sort=x")),
    ).toEqual(DEFAULT_FILTERS);
  });
});

describe("stats", () => {
  it("counts watched time from progress and the rating distribution", () => {
    expect(watchedMinutes(items[2], meta["tv:3"])).toBe(13 * 50);
    const stats = computeStats(items, meta, null);
    expect(stats.movies).toBe(2);
    expect(stats.shows).toBe(1);
    expect(stats.hours).toBe(Math.round((120 + 90 + 650) / 60));
    expect(stats.average).toBe(7.5);
    expect(stats.genres[0]).toMatchObject({ label: "Драма", value: 2 });
    expect(stats.best.map((x) => x.id)).toEqual([1, 2]);
    expect(stats.watchlist).toBe(1);
  });
});

describe("series tracking", () => {
  const seasons = [
    { season_number: 0, episode_count: 3 },
    { season_number: 1, episode_count: 10 },
    { season_number: 2, episode_count: 8 },
  ];
  it("moves across season boundaries", () => {
    expect(nextEpisode(null, seasons)).toEqual({ season: 1, episode: 1 });
    expect(nextEpisode({ season: 1, episode: 10 }, seasons)).toEqual({
      season: 2,
      episode: 1,
    });
    expect(nextEpisode({ season: 2, episode: 8 }, seasons)).toBeNull();
    expect(previousEpisode({ season: 2, episode: 1 }, seasons)).toEqual({
      season: 1,
      episode: 10,
    });
    expect(previousEpisode({ season: 1, episode: 1 }, seasons)).toEqual({
      season: 0,
      episode: 0,
    });
  });
  it("knows whether the next episode has aired", () => {
    const show = item({
      type: "tv",
      status: "watching",
      season: 2,
      episode: 3,
    });
    expect(
      continueState(show, {
        seasons,
        last_episode_to_air: {
          season_number: 2,
          episode_number: 5,
          air_date: "2026-09-20",
        },
      }),
    ).toMatchObject({ next: { season: 2, episode: 4 }, available: true });
    expect(
      continueState(item({ ...show, episode: 5 }), {
        seasons,
        last_episode_to_air: {
          season_number: 2,
          episode_number: 5,
          air_date: "2026-09-20",
        },
        next_episode_to_air: {
          season_number: 2,
          episode_number: 6,
          air_date: "2026-10-04",
        },
      }),
    ).toMatchObject({
      next: { season: 2, episode: 6 },
      available: false,
      date: "2026-10-04",
    });
  });
});

describe("taste match", () => {
  it("needs three common ratings and scales the difference", () => {
    const mine = [
      item({ id: 1, rating: 8 }),
      item({ id: 2, rating: 6 }),
      item({ id: 5, rating: 10 }),
    ];
    const theirs = [
      { type: "movie" as const, id: 1, rating: 8 },
      { type: "movie" as const, id: 2, rating: 9 },
    ];
    expect(tasteMatch(mine, theirs)).toBeNull();
    expect(
      tasteMatch(mine, [
        ...theirs,
        { type: "movie" as const, id: 5, rating: 10 },
      ]),
    ).toEqual({ percent: 89, common: 3 });
  });
});
