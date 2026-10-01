import { describe, expect, it } from "vitest";
import {
  awardsLabel,
  certification,
  extraCrew,
  money,
  providerGroups,
  regionalDates,
  sortedVideos,
  votesLabel,
} from "../../src/lib/titleFacts";
import type { TitleDetails } from "../../src/lib/tmdb";

const movie: TitleDetails = {
  id: 1,
  title: "Film",
  release_dates: {
    results: [
      {
        iso_3166_1: "US",
        release_dates: [
          {
            release_date: "2017-05-05T00:00:00.000Z",
            type: 3,
            certification: "PG-13",
          },
        ],
      },
      {
        iso_3166_1: "UA",
        release_dates: [
          {
            release_date: "2017-05-04T00:00:00.000Z",
            type: 3,
            certification: "",
          },
          {
            release_date: "2017-08-22T00:00:00.000Z",
            type: 4,
            certification: "",
          },
          {
            release_date: "2017-04-19T00:00:00.000Z",
            type: 1,
            certification: "16+",
          },
        ],
      },
    ],
  },
};

describe("title facts", () => {
  it("takes the regional age rating, then the US one", () => {
    expect(certification(movie, "movie", "UA")).toEqual({
      code: "16+",
      country: "UA",
    });
    expect(certification(movie, "movie", "DE")).toEqual({
      code: "PG-13",
      country: "US",
    });
    expect(
      certification(
        {
          id: 2,
          content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] },
        },
        "tv",
        "UA",
      ),
    ).toEqual({ code: "TV-MA", country: "US" });
  });

  it("lists regional release dates in order", () => {
    expect(regionalDates(movie, "UA")).toEqual([
      { label: "Премьера", date: "19 апреля 2017" },
      { label: "В кино", date: "4 мая 2017" },
      { label: "Онлайн", date: "22 августа 2017" },
    ]);
    expect(regionalDates(movie, "PL")).toEqual([]);
  });

  it("translates OMDb awards and keeps unknown formats", () => {
    expect(
      awardsLabel("Nominated for 1 Oscar. 15 wins & 62 nominations total"),
    ).toBe("«Оскар»: 1 номинация · всего 15 наград и 62 номинации");
    expect(awardsLabel("Won 3 Oscars. 120 wins & 200 nominations total")).toBe(
      "«Оскар»: 3 победы · всего 120 наград и 200 номинаций",
    );
    expect(awardsLabel("Won 2 Primetime Emmys. 5 wins total")).toBe(
      "«Эмми»: 2 победы · всего 5 наград",
    );
    expect(awardsLabel("3 nominations total")).toBe("всего 3 номинации");
    expect(awardsLabel("Won the Palme d'Or")).toBe("Won the Palme d'Or");
    expect(awardsLabel(null)).toBeNull();
  });

  it("formats money and votes", () => {
    expect(money(200_000_000)).toBe("$200 млн");
    expect(money("$389,813,101")).toBe("$390 млн");
    expect(money(1_234_000_000)).toMatch(/^\$1,2 млрд$/);
    expect(money(0)).toBeNull();
    expect(votesLabel(828114)).toBe("828 тыс. голосов");
    expect(votesLabel(2_400_000)).toMatch(/^2,4 млн голосов$/);
    expect(votesLabel(21)).toBe("21 голос");
  });

  it("groups providers and orders videos and crew", () => {
    const p = (id: number) => ({
      provider_id: id,
      provider_name: `P${id}`,
      logo_path: "",
    });
    expect(
      providerGroups({ flatrate: [p(8), p(8)], rent: [p(2)], buy: [p(2)] }).map(
        (g) => [g.label, g.providers.length],
      ),
    ).toEqual([
      ["По подписке", 1],
      ["Аренда", 1],
      ["Покупка", 1],
    ]);
    const v = (key: string, type: string, lang: string) => ({
      key,
      type,
      site: "YouTube",
      name: key,
      official: true,
      iso_639_1: lang,
    });
    expect(
      sortedVideos([
        v("a", "Featurette", "en"),
        v("b", "Trailer", "en"),
        v("c", "Trailer", "ru"),
      ]).map((x) => x.key),
    ).toEqual(["c", "b", "a"]);
    expect(
      extraCrew({
        id: 1,
        credits: {
          cast: [],
          crew: [
            {
              id: 5,
              name: "Tyler Bates",
              job: "Original Music Composer",
              profile_path: null,
            },
            {
              id: 6,
              name: "Henry Braham",
              job: "Director of Photography",
              profile_path: null,
            },
          ],
        },
      }).map((r) => r.role),
    ).toEqual(["Композитор", "Оператор"]);
  });
});
