import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../src/lib/library";
import type { MetaMap } from "../../src/lib/meta";
import { tmdb, type TmdbItem } from "../../src/lib/tmdb";
import type { Answers } from "../../src/lib/tonight";
import { runEngine } from "../../src/lib/engine";
import {
  buildProfile,
  favouriteDirectors,
  favouriteLanguage,
  signalTitles,
  titleWeight,
  topGenres,
} from "../../src/lib/engine/profile";
import {
  CandidatePool,
  diversify,
  scoreCandidates,
  seeded,
} from "../../src/lib/engine/score";
import type { SignalMap, TitleSignals } from "../../src/lib/engine/signals";

const NOW = Date.UTC(2026, 10, 27);
const lib = (over: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  type: "movie",
  title: "x",
  poster: "",
  year: "2020",
  status: "watched",
  rating: null,
  note: "",
  updatedAt: NOW,
  ...over,
});
const sig = (over: Partial<TitleSignals>): TitleSignals => ({
  genres: [],
  keywords: [],
  directors: [],
  cast: [],
  language: "en",
  runtime: 110,
  year: 2015,
  vote: 7.5,
  votes: 5000,
  recs: [],
  at: NOW,
  ...over,
});
const film = (id: number, over: Partial<TmdbItem> = {}): TmdbItem => ({
  id,
  title: `Фільм ${id}`,
  poster_path: `/p${id}.jpg`,
  genre_ids: [878],
  vote_average: 7.5,
  vote_count: 3000,
  popularity: 50,
  release_date: "2018-05-01",
  original_language: "en",
  media_type: "movie",
  ...over,
});
const any: Answers = {
  mood: "any",
  format: "movie",
  company: "solo",
  era: "any",
  mine: false,
};
const ctx = (seen: string[] = []) => ({
  seen: new Set(seen),
  random: () => 0.5,
  today: "2026-11-27",
});

/** A person who loves Villeneuve's sci-fi, Korean thrillers, hates horror. */
const library = [
  lib({ id: 1, title: "Дюна", rating: 10 }),
  lib({ id: 2, title: "Прибуття", rating: 9 }),
  lib({ id: 3, title: "Олдбой", rating: 9 }),
  lib({ id: 4, title: "Пила", rating: 3 }),
  lib({ id: 5, title: "Заклятие", status: "dropped" }),
  lib({ id: 6, title: "Середнячок", rating: 6 }),
];
const villeneuve = { id: 137427, name: "Denis Villeneuve" };
const signals: SignalMap = {
  "movie:1": sig({
    genres: [878, 12],
    keywords: [100, 200],
    directors: [villeneuve],
    vote: 8,
    recs: [film(50), film(51, { genre_ids: [878, 53] })],
  }),
  "movie:2": sig({
    genres: [878, 18],
    keywords: [100],
    directors: [villeneuve],
    vote: 7.9,
    recs: [film(51, { genre_ids: [878, 53] }), film(52)],
  }),
  "movie:3": sig({
    genres: [53, 9648],
    language: "ko",
    vote: 8.3,
    recs: [film(60, { genre_ids: [53], original_language: "ko" })],
  }),
  "movie:4": sig({
    genres: [27, 53],
    vote: 6.5,
    recs: [film(70, { genre_ids: [27] }), film(52)],
  }),
  "movie:5": sig({ genres: [27], vote: 6.8 }),
  "movie:6": sig({ genres: [35], vote: 6.4 }),
};

describe("taste profile", () => {
  it("reads ratings on the person's own scale", () => {
    const strict = { mean: 5.5, spread: 1.5 };
    const generous = { mean: 8.5, spread: 1 };
    expect(titleWeight(lib({ rating: 7 }), strict)).toBeGreaterThan(
      titleWeight(lib({ rating: 8 }), generous),
    );
    expect(titleWeight(lib({ rating: 10 }), generous)).toBeGreaterThanOrEqual(
      0.8,
    );
    expect(titleWeight(lib({ status: "dropped" }), strict)).toBeLessThan(-0.5);
    expect(titleWeight(lib({ status: "watchlist" }), strict)).toBeGreaterThan(
      0,
    );
  });

  it("learns genres, directors, language and dislikes", () => {
    const p = buildProfile(library, {}, signals, new Map(), NOW);
    expect(topGenres(p, 1)).toEqual([878]);
    expect(p.genres.get(27)!).toBeLessThan(0);
    expect(favouriteDirectors(p, 1)[0][1].name).toBe("Denis Villeneuve");
    expect(favouriteDirectors(p, 1)[0][1].avg).toBe(9.5);
    expect(favouriteLanguage(p)).toBe("ko");
    expect(p.seeds.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(p.antiSeeds.map((s) => s.id)).toEqual([4]);
    // Their ratings follow the audience's.
    expect(p.followsCrowd).toBeGreaterThan(0.5);
  });

  it("lets old marks fade a little", () => {
    const old = buildProfile(
      [lib({ id: 1, rating: 10, updatedAt: NOW - 6 * 365 * 86400_000 })],
      {},
      { "movie:1": sig({ genres: [878] }) },
      new Map(),
      NOW,
    );
    const fresh = buildProfile(
      [lib({ id: 1, rating: 10 })],
      {},
      { "movie:1": sig({ genres: [878] }) },
      new Map(),
      NOW,
    );
    expect(old.genres.get(878)!).toBeLessThan(fresh.genres.get(878)!);
  });

  it("asks TMDB about the best titles and a varied few more", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      lib({ id: i + 1, rating: 9 }),
    );
    const a = signalTitles(many, seeded(1)).map((x) => x.id);
    const b = signalTitles(many, seeded(2)).map((x) => x.id);
    expect(a.slice(0, 6)).toEqual(b.slice(0, 6));
    expect(a).toHaveLength(10);
    expect(a).not.toEqual(b);
  });
});

describe("scoring", () => {
  const profile = buildProfile(library, {}, signals, new Map(), NOW);
  const seedOf = (id: number) => profile.seeds.find((s) => s.id === id)!;

  it("puts what liked titles agree on and quality first, says why", () => {
    const pool = new CandidatePool();
    pool.add("movie", film(51, { genre_ids: [878, 53] }), "seed", {
      seed: seedOf(1),
      rank: 1,
    });
    pool.add("movie", film(51, { genre_ids: [878, 53] }), "seed", {
      seed: seedOf(2),
      rank: 0,
    });
    pool.add(
      "movie",
      film(80, { genre_ids: [35], vote_average: 6.2 }),
      "genres",
    );
    pool.add(
      "movie",
      film(81, { genre_ids: [878], vote_average: 8.6, vote_count: 20000 }),
      "best",
    );
    pool.add("movie", film(82, { genre_ids: [878] }), "director", {
      director: villeneuve.id,
    });
    const out = scoreCandidates(pool.list, profile, any, ctx());
    expect(out.at(-1)?.item.id).toBe(80);
    const both = out.find((p) => p.item.id === 51)!;
    expect(both.reasons[0]).toBe(
      "після «Дюна» і «Прибуття», які тобі сподобалися",
    );
    expect(both.match).toBeGreaterThan(80);
    expect(out.find((p) => p.item.id === 81)!.reasons).toContain(
      "глядачі в захваті: ★ 8.6 від 20 тис. людей",
    );
    expect(out.find((p) => p.item.id === 82)!.reasons).toContain(
      "режисер Denis Villeneuve: твої оцінки його робіт у середньому 9.5",
    );
  });

  it("pulls down what disliked titles lead to and disliked genres", () => {
    const pool = new CandidatePool();
    pool.add("movie", film(90, { genre_ids: [53] }), "genres");
    pool.add("movie", film(91, { genre_ids: [53] }), "genres");
    pool.list[1].anti.push({ seed: profile.antiSeeds[0], rank: 0 });
    pool.add("movie", film(92, { genre_ids: [53, 27] }), "genres");
    const out = scoreCandidates(pool.list, profile, any, ctx());
    expect(out.map((p) => p.item.id)).toEqual([90, 91, 92]);
  });

  it("keeps to the evening: mood, seen, family, length, era", () => {
    const pool = new CandidatePool();
    pool.add("movie", film(1), "best"); // seen
    pool.add("movie", film(2, { genre_ids: [35] }), "genres");
    pool.add("movie", film(3, { genre_ids: [35, 27] }), "genres");
    pool.add("movie", film(4, { genre_ids: [35] }), "seed", {
      seed: seedOf(1),
    }); // length unknown
    pool.add(
      "movie",
      film(5, { genre_ids: [35], release_date: "1990-01-01" }),
      "genres",
    );
    pool.add(
      "movie",
      film(6, { genre_ids: [35], release_date: "2027-01-01" }),
      "genres",
    );
    pool.add(
      "tv",
      { ...film(7, { genre_ids: [35] }), media_type: "tv" },
      "genres",
    );
    const out = scoreCandidates(
      pool.list,
      profile,
      {
        mood: "laugh",
        format: "short",
        company: "family",
        era: "new",
        mine: false,
      },
      ctx(["movie:1"]),
    );
    expect(out.map((p) => p.item.id)).toEqual([]);
    const relaxed = scoreCandidates(
      pool.list,
      profile,
      { ...any, mood: "laugh", company: "family" },
      ctx(["movie:1"]),
    );
    expect(relaxed.map((p) => p.item.id).sort()).toEqual([2, 4, 5]);
  });

  it("varies the list and orders each page from the best down", () => {
    const pool = new CandidatePool();
    for (let i = 0; i < 6; i++)
      pool.add("movie", film(100 + i, { vote_average: 8 - i * 0.01 }), "best");
    pool.add(
      "movie",
      film(200, {
        genre_ids: [53, 9648],
        vote_average: 7.4,
        original_language: "ko",
      }),
      "language",
    );
    const scored = scoreCandidates(pool.list, profile, any, ctx());
    const page = diversify(scored, 6, 6, 0.5);
    expect(page.map((p) => p.item.id)).toContain(200);
    const scores = page.map((p) => p.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("the whole evening", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("learns from the library and fills the evening from several angles", async () => {
    vi.spyOn(tmdb, "genres").mockResolvedValue({
      genres: [{ id: 878, name: "фантастика" }],
    });
    vi.spyOn(tmdb, "signals").mockImplementation(async (_type, id) => ({
      id,
      genres: [{ id: 878, name: "фантастика" }],
      vote_average: 8,
      vote_count: 9000,
      original_language: "en",
      release_date: "2016-01-01",
      credits: {
        cast: [],
        crew: [{ ...villeneuve, job: "Director", profile_path: null }],
      },
      keywords: { keywords: [{ id: 100, name: "alien" }] },
      recommendations: {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [film(300 + id)],
      },
    }));
    vi.spyOn(tmdb, "basic").mockResolvedValue({
      id: 77,
      genres: [{ id: 878, name: "фантастика" }],
      runtime: 95,
      vote_average: 7.9,
      vote_count: 4000,
    });
    const discover = vi
      .spyOn(tmdb, "discoverBy")
      .mockImplementation(async (_type, p) => ({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [film(p.with_crew ? 400 : p.with_keywords ? 401 : 402)],
      }));
    const result = await runEngine({
      answers: any,
      items: [
        lib({ id: 1, title: "Дюна", rating: 10 }),
        lib({ id: 2, title: "Прибуття", rating: 9 }),
        lib({ id: 77, title: "Чекаю", status: "watchlist" }),
      ],
      meta: {} as MetaMap,
      region: "UA",
      services: [],
      seen: new Set(["movie:1", "movie:2"]),
      seed: 1,
      day: "2026-11-27",
    });
    const ids = result.picks.map((p) => p.item.id);
    expect(ids).toEqual(expect.arrayContaining([301, 302, 400, 401, 402, 77]));
    expect(result.picks.find((p) => p.item.id === 77)!.reasons[0]).toBe(
      "із твого «Хочу подивитися»",
    );
    expect(result.summary.genres[0]).toBe("фантастика");
    expect(result.summary.directors).toEqual(["Denis Villeneuve"]);
    const queries = discover.mock.calls.map(([, p]) => p);
    expect(queries.some((p) => p.with_crew === villeneuve.id)).toBe(true);
    expect(queries.some((p) => p.with_keywords === "100")).toBe(true);
    expect(queries.some((p) => p["vote_count.lte"] === 1500)).toBe(true);

    // Signals are kept: the next evening asks TMDB nothing about the library.
    vi.mocked(tmdb.signals).mockClear();
    await runEngine({
      answers: any,
      items: [
        lib({ id: 1, title: "Дюна", rating: 10 }),
        lib({ id: 2, title: "Прибуття", rating: 9 }),
      ],
      meta: {},
      region: "UA",
      services: [],
      seen: new Set(),
      seed: 2,
      day: "2026-11-27",
    });
    expect(tmdb.signals).not.toHaveBeenCalled();
  });
});
