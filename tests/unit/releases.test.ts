import { describe, expect, it } from "vitest";
import {
  daysUntil,
  inReleaseWindow,
  movieReleaseDate,
  showRelease,
} from "../../src/lib/releases";

const today = "2026-10-01";

describe("watchlist release window", () => {
  it("covers the coming week and the past week only", () => {
    expect(daysUntil("2026-10-03", today)).toBe(2);
    expect(daysUntil("2026-09-24", today)).toBe(-7);
    expect(inReleaseWindow("2026-10-03", today)).toBe(true);
    expect(inReleaseWindow("2026-09-24", today)).toBe(true);
    expect(inReleaseWindow("2026-10-08", today)).toBe(true);
    expect(inReleaseWindow("2026-10-09", today)).toBe(false);
    expect(inReleaseWindow("2026-09-23", today)).toBe(false);
    expect(inReleaseWindow("", today)).toBe(false);
  });

  it("prefers the regional public release over festival premieres", () => {
    const movie = {
      id: 1,
      release_date: "2026-05-20",
      release_dates: {
        results: [
          {
            iso_3166_1: "UA",
            release_dates: [
              { release_date: "2026-05-20T00:00:00.000Z", type: 1 },
              { release_date: "2026-10-02T00:00:00.000Z", type: 3 },
              { release_date: "2026-11-10T00:00:00.000Z", type: 4 },
            ],
          },
        ],
      },
    };
    expect(movieReleaseDate(movie, "UA")).toBe("2026-10-02");
    expect(movieReleaseDate(movie, "US")).toBe("2026-05-20");
  });

  it("finds season premieres but not ordinary episodes", () => {
    expect(
      showRelease(
        {
          id: 2,
          first_air_date: "2020-01-01",
          next_episode_to_air: {
            air_date: "2026-10-04",
            season_number: 3,
            episode_number: 1,
          },
        },
        today,
      ),
    ).toEqual({ date: "2026-10-04", kind: "season", season: 3 });
    expect(
      showRelease(
        {
          id: 3,
          first_air_date: "2020-01-01",
          last_episode_to_air: {
            air_date: "2026-09-30",
            season_number: 3,
            episode_number: 4,
          },
        },
        today,
      ),
    ).toBeNull();
    expect(showRelease({ id: 4, first_air_date: "2026-09-28" }, today)).toEqual(
      { date: "2026-09-28", kind: "series", season: 1 },
    );
  });
});
