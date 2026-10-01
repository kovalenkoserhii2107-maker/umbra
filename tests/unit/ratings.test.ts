import { describe, expect, it } from "vitest";
import { parseCriticScores } from "../../src/lib/ratings";
import { parseOmdb } from "../../src/lib/omdb";

const wd = (id: string) => ({ value: `http://www.wikidata.org/entity/${id}` });
const RT = "Q105584";
const MC = "Q150248";

describe("critic scores from Wikidata", () => {
  it("keeps the latest Tomatometer and Metascore and ignores audience scores", () => {
    const scores = parseCriticScores({
      results: {
        bindings: [
          {
            rt: { value: "m/the_shawshank_redemption" },
            by: wd(RT),
            score: { value: "89%" },
            method: wd("Q108403393"),
            date: { value: "2019-01-01T00:00:00Z" },
          },
          {
            rt: { value: "m/the_shawshank_redemption" },
            by: wd(RT),
            score: { value: "91%" },
            method: wd("Q108403393"),
            date: { value: "2024-01-01T00:00:00Z" },
          },
          {
            by: wd(RT),
            score: { value: "98%" },
            method: wd("Q108403540"),
            date: { value: "2025-01-01T00:00:00Z" },
          },
          { by: wd(RT), score: { value: "8.2/10" } },
          { by: wd(MC), score: { value: "82/100" } },
          { by: wd(MC), score: { value: "8.9/10" } },
        ],
      },
    });
    expect(scores).toEqual({
      tomatometer: 91,
      rottenTomatoesId: "m/the_shawshank_redemption",
      metascore: 82,
    });
  });

  it("returns empty scores rather than inventing them", () => {
    expect(parseCriticScores({ results: { bindings: [] } })).toEqual({
      tomatometer: null,
      rottenTomatoesId: null,
      metascore: null,
    });
    expect(parseCriticScores(null).metascore).toBeNull();
  });
});

describe("OMDb scores", () => {
  it("reads the Tomatometer, Metascore and Rotten Tomatoes link", () => {
    expect(
      parseOmdb({
        Response: "True",
        Ratings: [
          { Source: "Internet Movie Database", Value: "9.3/10" },
          { Source: "Rotten Tomatoes", Value: "89%" },
          { Source: "Metacritic", Value: "82/100" },
        ],
        Metascore: "82",
        tomatoURL: "https://www.rottentomatoes.com/m/shawshank_redemption",
      }),
    ).toEqual({
      tomatometer: 89,
      metascore: 82,
      rottenTomatoesUrl:
        "https://www.rottentomatoes.com/m/shawshank_redemption",
    });
  });
  it("treats N/A, errors and foreign links as missing", () => {
    expect(
      parseOmdb({
        Response: "True",
        Ratings: [],
        Metascore: "N/A",
        tomatoURL: "N/A",
      }),
    ).toEqual({ tomatometer: null, metascore: null, rottenTomatoesUrl: null });
    expect(
      parseOmdb({ Response: "False", Error: "Invalid API key!" }),
    ).toBeNull();
  });
});
