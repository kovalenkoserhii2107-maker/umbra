import { describe, expect, it } from "vitest";
import {
  mergeSteam,
  parseEntry,
  platformCounts,
  playedHours,
  sortEntries,
  type GameEntry,
} from "../../src/lib/gameEntry";

const entry = (over: Partial<GameEntry> = {}): GameEntry => ({
  id: 1942,
  title: "The Witcher 3",
  cover: "https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg",
  year: "2015",
  genre: "Ролевая",
  platforms: ["playstation"],
  status: "played",
  rating: 9,
  note: "Шедевр",
  hours: 120,
  updatedAt: 10,
  ...over,
});

describe("game entries", () => {
  it("accept what the Firestore rule accepts and reject the rest", () => {
    expect(parseEntry(entry())).toEqual(entry());
    expect(() =>
      parseEntry(entry({ platforms: ["dreamcast" as never] })),
    ).toThrow();
    expect(() => parseEntry(entry({ status: "watched" as never }))).toThrow();
    expect(() =>
      parseEntry(entry({ cover: "https://evil.example/x.jpg" })),
    ).toThrow();
    expect(() => parseEntry(entry({ rating: 11 }))).toThrow();
    expect(() =>
      parseEntry(
        entry({ steam: { appId: 1, minutes: 1.5, recent: 0, lastPlayed: 0 } }),
      ),
    ).toThrow();
  });

  it("count hours from Steam first and sort by them", () => {
    const steam = entry({
      id: 2,
      hours: 3,
      steam: { appId: 1, minutes: 600, recent: 0, lastPlayed: 0 },
    });
    expect(playedHours(steam)).toBe(10);
    expect(playedHours(entry({ hours: null }))).toBeNull();
    expect(sortEntries([steam, entry()], "hours").map((e) => e.id)).toEqual([
      1942, 2,
    ]);
    expect(
      sortEntries(
        [entry({ id: 3, title: "Ёлка" }), entry({ id: 4, title: "Альфа" })],
        "title",
      ).map((e) => e.id),
    ).toEqual([4, 3]);
  });

  it("count games per platform for the switcher", () => {
    expect(
      platformCounts([
        entry(),
        entry({ id: 2, platforms: ["pc", "playstation"] }),
        entry({ id: 3, platforms: [] }),
      ]),
    ).toEqual({ all: 3, pc: 1, playstation: 2, xbox: 0, nintendo: 0 });
  });
});

describe("Steam merge", () => {
  const summary = (id: number, title: string) => ({
    id,
    title,
    cover: "",
    year: "",
    genre: "",
  });
  const play = (appId: number, minutes: number, recent = 0) => ({
    appId,
    minutes,
    recent,
    lastPlayed: 1,
  });

  it("keeps the player's marks, adds PC and play time, imports new games", () => {
    const changed = mergeSteam(
      [entry(), entry({ id: 5, status: "want", platforms: [] })],
      [
        { id: 1942, play: play(292030, 7200), summary: summary(1942, "W3") },
        { id: 5, play: play(55, 60), summary: summary(5, "Bought") },
        { id: 6, play: play(66, 30, 30), summary: summary(6, "Fresh") },
        { id: 7, play: play(77, 0), summary: summary(7, "Backlog") },
      ],
      [
        { id: 8, summary: summary(8, "Wished") },
        { id: 6, summary: summary(6, "Fresh") },
      ],
    );
    const by = new Map(changed.map((e) => [e.id, e]));
    expect(by.get(1942)).toMatchObject({
      status: "played",
      rating: 9,
      note: "Шедевр",
      platforms: ["playstation", "pc"],
      steam: { minutes: 7200 },
    });
    expect(by.get(5)?.status).toBe("owned");
    expect(by.get(6)?.status).toBe("playing");
    expect(by.get(7)?.status).toBe("owned");
    expect(by.get(8)).toMatchObject({ status: "want", platforms: ["pc"] });
    expect(changed).toHaveLength(5);
  });

  it("skips games whose Steam numbers did not change", () => {
    const current = entry({ platforms: ["pc"], steam: play(292030, 7200) });
    expect(
      mergeSteam(
        [current],
        [{ id: 1942, play: play(292030, 7200), summary: summary(1942, "W3") }],
        [],
      ),
    ).toEqual([]);
  });
});
