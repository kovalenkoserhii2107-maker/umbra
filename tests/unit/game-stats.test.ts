import { describe, expect, it } from "vitest";
import { computeGameStats, gameYears } from "../../src/lib/gameStats";
import type { GameEntry } from "../../src/lib/gameEntry";

const g = (over: Partial<GameEntry>): GameEntry => ({
  id: 1,
  title: "Game",
  cover: "",
  year: "2020",
  genre: "Ролевая",
  platforms: ["pc"],
  status: "played",
  rating: null,
  note: "",
  hours: null,
  updatedAt: Date.UTC(2026, 0, 5),
  ...over,
});

const games = [
  g({ id: 1, rating: 10, hours: 120, platforms: ["playstation"] }),
  g({
    id: 2,
    status: "owned",
    steam: {
      appId: 1,
      minutes: 600,
      recent: 90,
      lastPlayed: Date.UTC(2025, 5, 1) / 1000,
    },
    updatedAt: 0,
  }),
  g({ id: 3, status: "want", genre: "Шутер", rating: 7 }),
  g({ id: 4, status: "played", rating: 10, platforms: ["pc", "playstation"] }),
];

describe("game stats", () => {
  it("adds up hours, statuses, platforms and ratings with the games behind them", () => {
    const s = computeGameStats(games, null);
    expect(s).toMatchObject({
      total: 4,
      played: 2,
      want: 1,
      hours: 130,
      recentHours: 1.5,
      average: 9,
    });
    expect(s.statuses.map((b) => [b.label, b.value])).toEqual([
      ["Хочу поиграть", 1],
      ["Пройдено", 2],
      ["В библиотеке", 1],
    ]);
    expect(s.platforms.find((b) => b.label === "PlayStation")).toMatchObject({
      value: 2,
      extra: "120 ч",
    });
    expect(s.ratings[0]).toMatchObject({ label: "10", value: 2 });
    expect(s.ratings[0].items.map((x) => x.id)).toEqual([1, 4]);
    expect(s.genres[0]).toMatchObject({
      label: "Ролевая",
      value: 3,
      extra: "средняя 10,0",
    });
    expect(s.mostPlayed.map((x) => x.id)).toEqual([1, 2]);
    expect(s.recent.map((x) => x.id)).toEqual([2]);
  });

  it("counts a year by the last mark or Steam session", () => {
    expect(gameYears(games)).toEqual([2026, 2025]);
    expect(computeGameStats(games, 2025).total).toBe(1);
  });
});
