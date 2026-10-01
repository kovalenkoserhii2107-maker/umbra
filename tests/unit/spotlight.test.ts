import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../src/lib/library";
import { pickSpotlight, tasteSeed } from "../../src/lib/spotlight";

const today = "2026-10-01";
const lib = (patch: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  type: "movie",
  title: "Фильм",
  poster: "",
  year: "2026",
  status: "watchlist",
  rating: null,
  note: "",
  updatedAt: 0,
  ...patch,
});
const popular = [
  {
    id: 50,
    title: "Хит недели",
    backdrop_path: "/b.jpg",
    media_type: "movie" as const,
  },
];

describe("home spotlight", () => {
  it("shows the watchlist release closest to today first", () => {
    const spot = pickSpotlight({
      releases: [
        {
          item: lib({ id: 2, title: "Позже" }),
          date: "2026-10-06",
          kind: "movie",
        },
        {
          item: lib({ id: 3, title: "Вчера" }),
          date: "2026-09-30",
          kind: "movie",
        },
        {
          item: lib({ id: 4, title: "Завтра" }),
          date: "2026-10-02",
          kind: "movie",
        },
      ],
      episodes: [],
      recommendations: [],
      popular,
      library: [],
      today,
    });
    expect(spot?.reason).toBe("release");
    expect(spot?.item.id).toBe(4);
    expect(spot?.kicker).toBe("Из «Хочу посмотреть»");
    expect(spot?.note).toBe("Выход 2 октября · завтра");
  });

  it("then a new episode of a followed series", () => {
    const show = lib({ id: 9, type: "tv", title: "Сериал", status: "watched" });
    const spot = pickSpotlight({
      releases: [],
      episodes: [
        {
          item: show,
          date: "2026-09-30",
          season: 2,
          episode: 5,
          details: { id: 9 },
        },
      ],
      recommendations: [],
      popular,
      library: [show],
      today,
    });
    expect(spot).toMatchObject({ reason: "episode", media: "tv" });
    expect(spot?.kicker).toBe("Новая серия · S2E5 · вчера");
  });

  it("recommends by the best rated title and skips what is already saved", () => {
    const best = lib({ id: 7, title: "Дюна", status: "watched", rating: 9 });
    const library = [
      lib({ id: 8, status: "watched", rating: 6 }),
      best,
      lib({ id: 60 }),
    ];
    expect(tasteSeed(library)?.id).toBe(7);
    const spot = pickSpotlight({
      releases: [],
      episodes: [],
      recommendations: [
        {
          id: 60,
          title: "Уже в списке",
          backdrop_path: "/a.jpg",
          media_type: "movie",
        },
        {
          id: 61,
          title: "Новое",
          backdrop_path: "/c.jpg",
          media_type: "movie",
        },
      ],
      popular,
      seed: tasteSeed(library),
      library,
      today,
    });
    expect(spot).toMatchObject({ reason: "recommendation", item: { id: 61 } });
    expect(spot?.note).toBe("Потому что ты оценил «Дюна» на 9/10");
  });

  it("falls back to the week's popular title for an empty collection", () => {
    const spot = pickSpotlight({
      releases: [],
      episodes: [],
      recommendations: [],
      popular,
      library: [],
      today,
    });
    expect(spot).toMatchObject({ reason: "popular", item: { id: 50 } });
  });
});
