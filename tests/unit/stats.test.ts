import { describe, expect, it } from "vitest";
import { computeStats } from "../../src/lib/stats";
import type { LibraryItem } from "../../src/lib/library";

const item = (
  id: number,
  type: "movie" | "tv",
  status: LibraryItem["status"],
): LibraryItem => ({
  id,
  type,
  title: `T${id}`,
  poster: "",
  year: "2020",
  status,
  rating: null,
  note: "",
  updatedAt: Date.UTC(2026, 3, 1),
});

describe("viewing stats", () => {
  it("count dropped titles neither as films nor as series", () => {
    const stats = computeStats(
      [
        item(1, "movie", "watched"),
        item(2, "movie", "dropped"),
        item(3, "tv", "watched"),
        item(4, "tv", "watching"),
        item(5, "tv", "dropped"),
        item(6, "tv", "watchlist"),
      ],
      {},
      null,
    );
    expect(stats.movies).toBe(1);
    expect(stats.shows).toBe(2);
    expect(stats.watchlist).toBe(1);
  });
});
