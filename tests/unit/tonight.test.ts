import { describe, expect, it } from "vitest";
import {
  genreTaste,
  rankTonight,
  type Answers,
  type Candidate,
} from "../../src/lib/tonight";
import type { LibraryItem } from "../../src/lib/library";
import type { MetaMap } from "../../src/lib/meta";

const lib = (over: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  type: "movie",
  title: "x",
  poster: "",
  year: "2020",
  status: "watched",
  rating: null,
  note: "",
  updatedAt: 1,
  ...over,
});
const meta: MetaMap = {
  "movie:1": { genres: ["комедия"], runtime: 90, date: "2020-01-01", at: 1 },
  "movie:2": { genres: ["комедия"], runtime: 95, date: "2021-01-01", at: 1 },
  "movie:3": { genres: ["ужасы"], runtime: 100, date: "2019-01-01", at: 1 },
};
const names = new Map([
  [35, "комедия"],
  [27, "ужасы"],
  [53, "триллер"],
  [10751, "семейный"],
  [18, "драма"],
]);
const answers: Answers = {
  mood: "laugh",
  format: "movie",
  company: "solo",
  era: "any",
  mine: false,
};
const film = (id: number, genre_ids: number[], extra = {}) => ({
  id,
  title: `Film ${id}`,
  genre_ids,
  vote_average: 7,
  vote_count: 1000,
  popularity: 50,
  release_date: "2022-05-01",
  ...extra,
});

describe("evening picks", () => {
  it("learn genre taste from ratings, trusting more ratings more", () => {
    const taste = genreTaste(
      [
        lib({ id: 1, rating: 10 }),
        lib({ id: 2, rating: 9 }),
        lib({ id: 3, rating: 3 }),
      ],
      meta,
    );
    expect(taste.get("комедия")!).toBeCloseTo(((9.5 - 6.5) / 3.5) * (2 / 3));
    expect(taste.get("ужасы")!).toBeLessThan(0);
  });

  it("keep the mood, skip what was seen, prefer the watchlist and loved lookalikes", () => {
    const candidates: Candidate[] = [
      { item: film(10, [35]), type: "movie", from: "discover" },
      { item: film(11, [35]), type: "movie", from: "watchlist" },
      {
        item: film(12, [35]),
        type: "movie",
        from: "similar",
        like: { title: "Мальчишник", rating: 9 },
      },
      { item: film(13, [27]), type: "movie", from: "discover" },
      { item: film(14, [35]), type: "movie", from: "discover" },
      { item: film(15, [35]), type: "tv", from: "discover" },
    ];
    const picks = rankTonight(candidates, answers, {
      seen: new Set(["movie:14"]),
      taste: new Map([["комедия", 0.5]]),
      names,
    });
    expect(picks.map((p) => p.item.id)).toEqual([11, 12, 10]);
    expect(picks[0].reasons[0]).toBe("из «Хочу посмотреть»");
    expect(picks[1].reasons[0]).toBe("похоже на «Мальчишник» — твоя 9/10");
  });

  it("keep scary films away from a family evening and respect length and era", () => {
    const family = rankTonight(
      [
        { item: film(20, [35, 27]), type: "movie", from: "discover" },
        {
          item: film(21, [35, 10751], { release_date: "2025-06-01" }),
          type: "movie",
          from: "discover",
        },
        {
          item: film(22, [35]),
          type: "movie",
          from: "watchlist",
          runtime: 140,
        },
        {
          item: film(23, [35], { release_date: "1999-01-01" }),
          type: "movie",
          from: "discover",
        },
      ],
      { ...answers, company: "family", format: "short", era: "new" },
      { seen: new Set(), taste: new Map(), names },
    );
    expect(family.map((p) => p.item.id)).toEqual([21]);
  });
});
