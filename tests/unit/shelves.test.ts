import { describe, expect, it, vi } from "vitest";

const discoverRaw = vi.fn();
vi.mock("../../src/lib/tmdb", () => ({
  tmdb: { discoverRaw: (...args: unknown[]) => discoverRaw(...args) },
}));

import { feedById, isShelf, loadFeedPage } from "../../src/lib/feeds";
import { SHELVES, shelfOrder } from "../../src/lib/shelves";

describe("home shelves", () => {
  it("are feeds with their own page", async () => {
    expect(isShelf("g-scifi")).toBe(true);
    expect(isShelf("trending")).toBe(false);
    expect(feedById("t-gems")).toMatchObject({
      title: "Приховані перлини",
      type: "movie",
      more: true,
    });
    discoverRaw.mockResolvedValue({
      page: 2,
      total_pages: 9,
      total_results: 180,
      results: [
        { id: 1, poster_path: "/a.jpg", media_type: "movie" },
        { id: 2, poster_path: null, media_type: "movie" },
      ],
    });
    const page = await loadFeedPage("g-scifi", 2);
    expect(page.results.map((x) => x.id)).toEqual([1]);
    expect(discoverRaw).toHaveBeenCalledWith(
      "movie",
      expect.objectContaining({ with_genres: "878", page: 2 }),
      "normal",
    );
    await loadFeedPage("t-mini", 1);
    expect(discoverRaw).toHaveBeenLastCalledWith(
      "tv",
      expect.objectContaining({ with_type: 2, page: 1 }),
      "low",
    );
  });

  it("puts liked genres first and a theme after every two genres", () => {
    const order = shelfOrder({ movie: { 35: 9 }, tv: { 10765: 5 } }, 0);
    expect(order).toHaveLength(SHELVES.length);
    expect(new Set(order.map((s) => s.id)).size).toBe(SHELVES.length);
    expect(order.slice(0, 3).map((s) => s.id)).toEqual([
      "g-comedy",
      "tv-scifi",
      "t-gems",
    ]);
    expect(order.slice(0, 9).map((s) => s.kind)).toEqual([
      "genre",
      "genre",
      "theme",
      "genre",
      "genre",
      "theme",
      "genre",
      "genre",
      "theme",
    ]);
    // Without a taste: the genres in their order; another theme each day.
    expect(shelfOrder(null, 0)[0].id).toBe("g-scifi");
    expect(shelfOrder(null, 1)[2].id).toBe("t-short");
  });
});
