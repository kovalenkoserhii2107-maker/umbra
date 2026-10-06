import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests run in Node: a small in-memory localStorage.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const discoverRaw = vi.fn();
const showAirDates = vi.fn();
vi.mock("../../src/lib/tmdb", () => ({
  tmdb: {
    discoverRaw: (...a: unknown[]) => discoverRaw(...a),
    showAirDates: (...a: unknown[]) => showAirDates(...a),
  },
}));

import {
  premiereLabel,
  upcomingMovies,
  upcomingShows,
} from "../../src/lib/upcoming";

const TODAY = new Date(2026, 9, 6, 12);
const page = (results: unknown[]) => ({
  page: 1,
  total_pages: 3,
  total_results: results.length,
  results,
});

beforeEach(() => {
  localStorage.clear();
  discoverRaw.mockReset();
  showAirDates.mockReset();
});

describe("coming soon", () => {
  it("lists films ahead by popularity, without a vote threshold", async () => {
    discoverRaw.mockResolvedValue(
      page([
        {
          id: 1,
          title: "B",
          release_date: "2026-12-18",
          popularity: 50,
          poster_path: "/b.jpg",
        },
        {
          id: 2,
          title: "A",
          release_date: "2026-11-01",
          popularity: 90,
          poster_path: "/a.jpg",
        },
        {
          id: 3,
          title: "No poster",
          release_date: "2026-10-20",
          popularity: 99,
          poster_path: null,
        },
      ]),
    );
    const data = await upcomingMovies(1, TODAY);
    expect(data.results.map((x) => x.id)).toEqual([2, 1]);
    expect(data.results[0].upcoming_date).toBe("2026-11-01");
    const [type, params] = discoverRaw.mock.calls[0];
    expect(type).toBe("movie");
    expect(params).toMatchObject({
      sort_by: "popularity.desc",
      "primary_release_date.gte": "2026-10-06",
      "primary_release_date.lte": "2027-10-06",
    });
    expect(params).not.toHaveProperty("vote_count.gte");
  });

  it("mixes new series with new seasons that have a premiere date", async () => {
    discoverRaw.mockImplementation(async (_type, params) =>
      params["first_air_date.gte"]
        ? page([
            {
              id: 10,
              name: "New show",
              first_air_date: "2026-11-20",
              popularity: 40,
              poster_path: "/n.jpg",
            },
          ])
        : page([
            {
              id: 20,
              name: "Season premiere",
              popularity: 300,
              poster_path: "/s.jpg",
            },
            {
              id: 21,
              name: "Weekly episode",
              popularity: 200,
              poster_path: "/w.jpg",
            },
            { id: 22, name: "No date", popularity: 100, poster_path: "/d.jpg" },
          ]),
    );
    showAirDates.mockImplementation(async (id: number) =>
      id === 20
        ? {
            next_episode_to_air: {
              air_date: "2026-10-30",
              season_number: 5,
              episode_number: 1,
            },
          }
        : id === 21
          ? {
              next_episode_to_air: {
                air_date: "2026-10-08",
                season_number: 2,
                episode_number: 6,
              },
            }
          : { next_episode_to_air: null },
    );
    const data = await upcomingShows(1, TODAY);
    expect(
      data.results.map((x) => [x.id, x.upcoming_date, x.upcoming_season]),
    ).toEqual([
      [20, "2026-10-30", 5],
      [10, "2026-11-20", undefined],
    ]);
  });

  it("keeps the first page on the device for the day", async () => {
    localStorage.clear();
    discoverRaw.mockResolvedValue(
      page([
        {
          id: 5,
          title: "Kept",
          release_date: "2026-11-01",
          popularity: 9,
          poster_path: "/k.jpg",
          overview: "long text that is not kept",
        },
      ]),
    );
    const first = await upcomingMovies(1, TODAY);
    const again = await upcomingMovies(1, TODAY);
    expect(discoverRaw).toHaveBeenCalledTimes(1);
    expect(again.results[0]).toMatchObject({
      id: 5,
      upcoming_date: "2026-11-01",
    });
    expect(again.results[0]).not.toHaveProperty("overview");
    expect(first.results).toHaveLength(1);
    // Another day, or another page, asks TMDB again.
    await upcomingMovies(1, new Date(2026, 9, 7, 12));
    await upcomingMovies(2, TODAY);
    expect(discoverRaw).toHaveBeenCalledTimes(3);
  });

  it("labels premiere dates", () => {
    expect(premiereLabel("2026-10-06", TODAY)).toBe("сегодня");
    expect(premiereLabel("2026-10-07", TODAY)).toBe("завтра");
    expect(premiereLabel("2026-11-14", TODAY)).toBe("14 ноября");
    expect(premiereLabel("2027-03-03", TODAY)).toBe("3 марта 2027");
  });
});
