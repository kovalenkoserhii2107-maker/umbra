import { describe, expect, it } from "vitest";
import {
  applySearch,
  countFilters,
  defaultFilters,
  filtersFromParams,
  filtersToParams,
  splitYear,
  switchLayout,
  yearRange,
} from "../../src/lib/search";

describe("search input helpers", () => {
  it("fixes text typed on the wrong keyboard layout", () => {
    expect(switchLayout("l.yf")).toBe("дюна");
    expect(switchLayout("ЬФЕКШЧ")).toBe("matrix");
    expect(switchLayout("дюна")).toBe("l.yf");
    // Mixed or digit-only text is left alone.
    expect(switchLayout("дюна dune")).toBeNull();
    expect(switchLayout("2049")).toBeNull();
  });

  it("takes a trailing year off the query", () => {
    expect(splitYear("дюна 2021")).toEqual({ text: "дюна", year: "2021" });
    expect(splitYear("  1917 ")).toEqual({ text: "1917", year: "" });
    expect(splitYear("бегущий по лезвию 2049")).toEqual({
      text: "бегущий по лезвию",
      year: "2049",
    });
  });
});

describe("search filters", () => {
  it("survive a round trip through the address", () => {
    const f = {
      ...defaultFilters,
      kind: "movie" as const,
      sort: "rating" as const,
      minScore: 7.5,
      genres: [35, 18],
      without: [27],
      era: "1990" as const,
      lang: "ko",
      runtime: "short" as const,
      fame: "gems" as const,
      mine: "unseen" as const,
      services: true,
    };
    const params = filtersToParams(f, new URLSearchParams("q=x&tab=movie"));
    expect(params.get("q")).toBe("x");
    expect(filtersFromParams(params)).toEqual(f);
    expect(countFilters(f)).toBe(10);
    expect(filtersFromParams(new URLSearchParams("score=5&era=bad"))).toEqual(
      defaultFilters,
    );
  });

  it("filter loaded results by genre, era, language and my collection", () => {
    const item = (id: number, extra: object) => ({
      id,
      title: `t${id}`,
      media_type: "movie" as const,
      vote_average: 7.5,
      vote_count: 500,
      release_date: "1995-01-01",
      genre_ids: [35],
      original_language: "en",
      ...extra,
    });
    const items = [
      item(1, {}),
      item(2, { genre_ids: [35, 27] }),
      item(3, { release_date: "2015-01-01" }),
      item(4, { original_language: "fr" }),
      item(5, {}),
      {
        id: 6,
        name: "s",
        media_type: "tv" as const,
        vote_average: 8,
        vote_count: 500,
        first_air_date: "1996-01-01",
        genre_ids: [10759],
        original_language: "en",
      },
    ];
    const shown = applySearch(
      items,
      "",
      {
        ...defaultFilters,
        genres: [35, 28],
        without: [27],
        era: "1990",
        lang: "en",
        mine: "unseen",
      },
      (x) => (x.id === 5 ? "watched" : undefined),
    );
    // Action maps to the series genre "Action & Adventure".
    expect(shown.map((x) => x.id).sort()).toEqual([1, 6]);
    expect(yearRange({ era: "classic", year: "" })).toEqual([1900, 1999]);
    expect(yearRange({ era: "2010", year: "2012" })).toEqual([2012, 2012]);
  });
});
