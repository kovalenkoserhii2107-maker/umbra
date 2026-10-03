import { describe, expect, it, vi } from "vitest";

const findTitle = vi.fn();
vi.mock("../../src/lib/tmdb", () => ({
  tmdb: { findTitle: (...args: unknown[]) => findTitle(...args) },
  titleOf: (x: { title?: string; name?: string }) => x.title || x.name || "",
}));

import {
  buildProfile,
  findPick,
  resolvePicks,
  roundAnswers,
  roundOf,
} from "../../src/lib/ai";
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
  "movie:1": { genres: ["триллер"], runtime: 150, date: "2007-03-02", at: 1 },
};

describe("AI picker on the client", () => {
  it("describes the library for Claude", () => {
    const text = buildProfile(
      [
        lib({ id: 1, title: "Зодиак", year: "2007", rating: 9, updatedAt: 5 }),
        lib({ id: 2, title: "Сумерки", rating: 3, status: "dropped" }),
        lib({
          id: 3,
          type: "tv",
          title: "Разделение",
          status: "watchlist",
          note: "все советуют",
        }),
        lib({ id: 4, title: "Аватар", year: "2009" }),
      ],
      meta,
      "UA",
      [{ id: 8, name: "Netflix" } as never],
    );
    expect(text).toContain("Страна: UA. Подписки: Netflix.");
    expect(text).toContain("- Зодиак (2007, фильм, триллер) — 9/10");
    expect(text).toContain("Бросил (не понравилось):\n- Сумерки");
    expect(text).toContain(
      "Разделение (2020, сериал) · заметка: «все советуют»",
    );
    expect(text).toContain("Посмотрено без оценки: Аватар (2009).");
    expect(text).toContain("триллер +");
  });

  it("counts answers per round", () => {
    const steps = [
      { question: "a", answer: "1" },
      { question: "b", answer: "2" },
      { shown: [] },
      { question: "c", answer: "3" },
    ];
    expect(roundAnswers(steps)).toBe(1);
    expect(roundOf(steps)).toBe(2);
    expect(roundAnswers([])).toBe(0);
  });

  it("finds Claude's titles on TMDB by original title and year", async () => {
    findTitle.mockReset();
    findTitle.mockImplementation(async (type, query, year) => {
      if (query === "Knives Out" && year === 2019)
        return {
          results: [
            { id: 9, title: "Другой", release_date: "2005-01-01" },
            { id: 546554, title: "Достать ножи", release_date: "2019-11-27" },
          ],
        };
      if (query === "Severance" && !year)
        return { results: [{ id: 95396, name: "Разделение" }] };
      return { results: [] };
    });
    expect(
      (
        await findPick({
          title: "Достать ножи",
          original_title: "Knives Out",
          year: 2019,
          type: "movie",
          reason: "",
        })
      )?.id,
    ).toBe(546554);

    const picks = await resolvePicks(
      [
        {
          title: "Достать ножи",
          original_title: "Knives Out",
          year: 2019,
          type: "movie",
          reason: "Детектив с юмором.",
        },
        {
          title: "Разделение",
          original_title: "Severance",
          year: 2030,
          type: "tv",
          reason: "Загадка.",
        },
        {
          title: "Нет такого",
          original_title: "Nope Nope",
          year: 2001,
          type: "movie",
          reason: "",
        },
      ],
      new Set(["tv:95396"]),
    );
    expect(picks.map((p) => p.key)).toEqual(["movie:546554"]);
    expect(picks[0].reasons).toEqual(["Детектив с юмором."]);
  });
});
