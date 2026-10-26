import { afterEach, describe, expect, it, vi } from "vitest";
import { episodeImdbIds, tvApi } from "../../src/lib/tv";

afterEach(() => vi.restoreAllMocks());

describe("IMDb ids of a season's episodes", () => {
  it("are asked at most three at a time, and only for episodes already out", async () => {
    let running = 0;
    let most = 0;
    const asked: number[] = [];
    vi.spyOn(tvApi, "episodeImdb").mockImplementation(async (_, __, n) => {
      asked.push(n);
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 4) throw new Error("HTTP_500");
      return { imdb_id: n === 5 ? undefined : `tt${n}` };
    });
    const episodes = Array.from({ length: 12 }, (_, i) => ({
      episode_number: i + 1,
      air_date: i < 10 ? "2026-01-0" + ((i % 9) + 1) : "2027-01-01",
    }));
    const ids = await episodeImdbIds(77, 1, episodes, "2026-06-01");
    expect(most).toBeLessThanOrEqual(3);
    expect(asked.sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(ids.get(1)).toBe("tt1");
    expect(ids.get(5)).toBe("");
    expect(ids.has(4)).toBe(false);
    expect(ids.has(11)).toBe(false);
  });
});
