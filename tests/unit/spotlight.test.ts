import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../src/lib/library";
import {
  likedSeeds,
  pickKey,
  pickSpotlight,
  rankForYou,
  takeTurns,
  tasteSeed,
  type ForYou,
} from "../../src/lib/spotlight";

const today = "2026-10-01";
const lib = (patch: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  type: "movie",
  title: "Фільм",
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
    title: "Хіт тижня",
    backdrop_path: "/b.jpg",
    media_type: "movie" as const,
  },
];

describe("home spotlight", () => {
  it("shows the watchlist release closest to today first", () => {
    const spot = pickSpotlight({
      releases: [
        {
          item: lib({ id: 2, title: "Пізніше" }),
          date: "2026-10-06",
          kind: "movie",
        },
        {
          item: lib({ id: 3, title: "Вчора" }),
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
    expect(spot?.kicker).toBe("З «Хочу подивитися»");
    expect(spot?.note).toBe("Вихід 2 жовтня · завтра");
  });

  it("then a new episode of a followed series", () => {
    const show = lib({ id: 9, type: "tv", title: "Серіал", status: "watched" });
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
    expect(spot?.kicker).toBe("Нова серія · S2E5 · учора");
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
          title: "Вже в списку",
          backdrop_path: "/a.jpg",
          media_type: "movie",
        },
        {
          id: 61,
          title: "Нове",
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
    expect(spot?.note).toBe("Тому що ти оцінив «Дюна» на 9/10");
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

  it("shows nothing personal while there is no fresh, well rated title", () => {
    const spot = pickSpotlight({
      forYou: rankForYou({ popular, library: [], today }),
      releases: [],
      episodes: [],
      recommendations: [],
      popular,
      library: [],
      today,
    });
    // The week's hit has no rating or date: it is not "new and rated 7+".
    expect(spot?.reason).toBe("popular");
  });
});

describe("«Для тебе» in the spotlight", () => {
  const film = (
    id: number,
    patch: Partial<{
      vote_average: number;
      vote_count: number;
      release_date: string;
      genre_ids: number[];
      popularity: number;
      backdrop_path: string | null;
    }> = {},
  ) => ({
    id,
    title: `Фільм ${id}`,
    backdrop_path: "/b.jpg",
    release_date: "2026-08-01",
    vote_average: 7.6,
    vote_count: 900,
    popularity: 80,
    genre_ids: [18],
    media_type: "movie" as const,
    ...patch,
  });
  const dune = { type: "movie" as const, id: 7, title: "Дюна", rating: 9 };
  const library = [
    lib({ id: 7, title: "Дюна", status: "watched", rating: 9 }),
    lib({ id: 70, status: "watchlist" }),
  ];

  it("keeps only new, popular, 7+ titles that are not in the collection", () => {
    const forYou: ForYou = {
      recs: [
        {
          seed: dune,
          results: [
            film(1, { genre_ids: [878, 12] }),
            film(2, { release_date: "2019-05-01", genre_ids: [878] }),
            film(3, { vote_average: 6.4, genre_ids: [878] }),
            film(4, { vote_count: 12, genre_ids: [878] }),
            film(70, { genre_ids: [878] }),
            film(5, { backdrop_path: null, genre_ids: [878] }),
            film(6, { release_date: "2027-01-01", genre_ids: [878] }),
          ],
        },
      ],
      discovered: [film(8, { genre_ids: [878], vote_average: 8.1 })],
    };
    const ranked = rankForYou({
      forYou,
      popular: [film(9, { genre_ids: [35] })],
      library,
      today,
    });
    expect(ranked.map(pickKey).sort()).toEqual([
      "movie:1",
      "movie:8",
      "movie:9",
    ]);
    // Matched to taste (a recommendation, sci-fi) beats a popular comedy.
    expect(ranked.at(-1)?.item.id).toBe(9);
    expect(ranked.find((p) => p.item.id === 1)?.because).toEqual(dune);
  });

  it("comes first and says why", () => {
    const [pick] = rankForYou({
      forYou: { recs: [{ seed: dune, results: [film(1)] }], discovered: [] },
      popular,
      library,
      today,
    });
    const spot = pickSpotlight({
      forYou: [pick],
      releases: [
        {
          item: lib({ id: 4, title: "Завтра" }),
          date: "2026-10-02",
          kind: "movie",
        },
      ],
      episodes: [],
      recommendations: [],
      popular,
      library,
      today,
    });
    expect(spot).toMatchObject({ reason: "for-you", item: { id: 1 } });
    expect(spot?.kicker).toBe("Для тебе · ★ 7.6 · 2026");
    expect(spot?.note).toBe("Тому що ти оцінив «Дюна» на 9/10");

    const stranger = pickSpotlight({
      forYou: rankForYou({ popular: [film(9)], library: [], today }),
      releases: [],
      episodes: [],
      recommendations: [],
      popular,
      library: [],
      today,
    });
    expect(stranger?.kicker).toBe("Нове й високо оцінене · ★ 7.6 · 2026");
  });

  it("takes turns between visits and holds still within one", () => {
    const ranked = rankForYou({
      forYou: null,
      popular: [
        film(1, { vote_average: 8.5 }),
        film(2, { vote_average: 8 }),
        film(3, { vote_average: 7.5 }),
      ],
      library: [],
      today,
    });
    expect(ranked.map((p) => p.item.id)).toEqual([1, 2, 3]);
    const first = (keep: string | null, recent: string[]) =>
      takeTurns(ranked, { keep, recent })[0].item.id;
    expect(first(null, [])).toBe(1);
    expect(first(null, ["movie:1"])).toBe(2);
    expect(first(null, ["movie:2", "movie:1"])).toBe(3);
    // All shown lately: the one shown longest ago.
    expect(first(null, ["movie:3", "movie:1", "movie:2"])).toBe(2);
    // Picked earlier this visit: stays.
    expect(first("movie:3", ["movie:3", "movie:2", "movie:1"])).toBe(3);
    expect(takeTurns(ranked, { keep: null, recent: ["movie:1"] })).toHaveLength(
      3,
    );
  });

  it("steers by a few liked titles, a different few each day", () => {
    const items = [1, 2, 3, 4, 5].map((id) =>
      lib({
        id,
        status: "watched",
        rating: [9, 9, 8, 8, 7][id - 1],
        updatedAt: id,
      }),
    );
    items.push(lib({ id: 9, status: "watched", rating: 4 }));
    const a = likedSeeds(items, "2026-10-01").map((x) => x.id);
    const b = likedSeeds(items, "2026-10-02").map((x) => x.id);
    expect(a).toHaveLength(3);
    expect(a).not.toEqual(b);
    expect([...a, ...b]).not.toContain(9);
  });
});
