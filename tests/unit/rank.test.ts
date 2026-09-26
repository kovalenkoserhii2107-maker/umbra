import { describe, expect, it } from "vitest";
import { byCatalogRank } from "../../src/lib/rank";

describe("catalog ranking", () => {
  it("puts fresh popular titles first, Korean later, and Indian last", () => {
    const day = (ago: number) => {
      const date = new Date();
      date.setDate(date.getDate() - ago);
      return date.toISOString().slice(0, 10);
    };
    const fresh = day(10);
    const alsoFresh = day(30);
    const ranked = byCatalogRank([
      {
        id: "in",
        original_language: "hi",
        popularity: 900,
        release_date: fresh,
      },
      {
        id: "ko",
        original_language: "ko",
        popularity: 800,
        release_date: fresh,
      },
      {
        id: "old",
        original_language: "en",
        popularity: 700,
        release_date: "1999-01-01",
      },
      {
        id: "new-quiet",
        original_language: "en",
        popularity: 40,
        release_date: alsoFresh,
      },
      {
        id: "new-hit",
        original_language: "en",
        popularity: 120,
        release_date: fresh,
      },
    ]);
    expect(ranked.map((item) => item.id)).toEqual([
      "new-hit",
      "new-quiet",
      "old",
      "ko",
      "in",
    ]);
  });
});
