import { describe, it, expect } from "vitest";
// @ts-expect-error Build-time data utilities deliberately run as plain Node ESM.
import {
  steamData,
  normalizeSteam,
  text,
} from "../../scripts/game-data-utils.mjs";
import { filterGames, defaultGameFilters } from "../../src/lib/gameSearch";

describe("game provider identity and facts", () => {
  it("never treats a numeric key in another provider as a Steam app match", () => {
    expect(
      steamData({ "620": { success: true, data: { steam_appid: 730 } } }, 620),
    ).toBeNull();
    expect(
      steamData(
        { "other-key": { success: true, data: { steam_appid: 620 } } },
        620,
      )?.steam_appid,
    ).toBe(620);
  });
  it("keeps prices, dates and review counts precise without guessing missing fields", () => {
    const d = normalizeSteam(
      {
        steam_appid: 620,
        platforms: { windows: true, mac: false },
        categories: [{ id: 2 }, { id: 27 }],
        price_overview: { final: 999, initial: 1999, currency: "UAH" },
        screenshots: [{ id: 1, path_thumbnail: "small", path_full: "large" }],
      },
      { query_summary: { total_reviews: 200, total_positive: 150 } },
      { response: { result: 1, player_count: 0 } },
      [
        { steamAppID: "730", storeID: "1", salePrice: "1", dealID: "wrong" },
        {
          steamAppID: "620",
          storeID: "1",
          salePrice: "5",
          normalPrice: "10",
          dealID: "correct",
        },
      ],
      { "1": "Steam" },
      "2026-09-27T00:00:00Z",
    );
    expect(d.steam).toBe(75);
    expect(d.steamReviewCount).toBe(200);
    expect(d.playerCount).toBe(0);
    expect(d.metacritic).toBeNull();
    expect(d.platforms).toEqual(["Windows"]);
    expect(d.modes).toEqual(["Один игрок", "Кооператив по сети"]);
    expect(d.offers).toHaveLength(2);
    expect(d.offers[0]).toMatchObject({
      price: 9.99,
      currency: "UAH",
      region: "UA",
    });
    expect(d.offers[1].url).toContain("cheapshark.com/redirect?dealID=correct");
    expect(d.screenshots[0].full).toBe("large");
  });
  it("does not turn missing prices or reviews into free offers or zero ratings", () => {
    const d = normalizeSteam({ steam_appid: 1 }, null, null, null, {}, "now");
    expect(d.offers).toEqual([]);
    expect(d.steam).toBeNull();
    expect(d.playerCount).toBeNull();
  });
  it("preserves readable paragraphs and decodes provider HTML as plain text", () => {
    expect(
      text(
        "<p>A &amp; B</p><p>Next &#39;chapter&#39;</p><script>bad()</script>",
      ),
    ).toBe("A & B\nNext 'chapter'");
  });
  it("searches punctuation and accented titles consistently", () => {
    const game = {
      id: 1,
      title: "S.T.A.L.K.E.R. 2",
      genre: "Action",
      platform: "PC",
      developer: "",
      publisher: "",
      release_date: "2024",
      thumbnail: "",
      short_description: "",
      game_url: "",
    };
    expect(
      filterGames([game], "s t a l k e r 2", defaultGameFilters, new Map()),
    ).toHaveLength(1);
  });
});
