import { describe, expect, it } from "vitest";
import { genreTaste } from "../../src/lib/tonight";
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
  "movie:1": { genres: ["комедія"], runtime: 90, date: "2020-01-01", at: 1 },
  "movie:2": { genres: ["комедія"], runtime: 95, date: "2021-01-01", at: 1 },
  "movie:3": { genres: ["жахи"], runtime: 100, date: "2019-01-01", at: 1 },
};
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
    expect(taste.get("комедія")!).toBeCloseTo(((9.5 - 6.5) / 3.5) * (2 / 3));
    expect(taste.get("жахи")!).toBeLessThan(0);
  });
});
