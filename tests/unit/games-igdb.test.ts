import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  clean,
  fuse,
  groupsOf,
  platformIds,
  steamAppId,
  toSummary,
  today,
  type RawGame,
} from "../../src/lib/igdb";
import {
  ageLabels,
  gameLinks,
  hours,
  multiplayerLabel,
  platformList,
  releaseRows,
  timeToBeatLabel,
} from "../../src/lib/gameFacts";

const game: RawGame = {
  id: 1,
  name: "Resident Evil 4",
  slug: "resident-evil-4--1",
  first_release_date: 1679616000, // 2023-03-24
  aggregated_rating: 91.6,
  aggregated_rating_count: 40,
  rating: 88.4,
  rating_count: 900,
  game_type: 8,
  platforms: [
    { id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" },
    { id: 167, name: "PlayStation 5", abbreviation: "PS5" },
    { id: 169, name: "Xbox Series X|S", abbreviation: "Series X|S" },
  ],
  genres: [{ name: "Shooter" }, { name: "Adventure" }],
  release_dates: [
    { date: 1679616000, platform: 6 },
    { date: 1679616000, platform: 167 },
    { date: 1679702400, platform: 6 },
    { date: 1700000000, platform: 169 },
  ],
  websites: [
    { url: "https://store.steampowered.com/app/2050650/Resident_Evil_4/" },
    { url: "https://www.residentevil.com/re4/" },
    { url: "https://en.wikipedia.org/wiki/Resident_Evil_4_(2023_video_game)" },
    { url: "https://www.facebook.com/residentevil" },
  ],
  multiplayer_modes: [{ onlinemax: 4, onlinecoop: true, onlinecoopmax: 2 }],
};

describe("IGDB data", () => {
  it("turns a raw game into a summary with Russian genres", () => {
    expect(toSummary(game)).toEqual({
      id: 1,
      name: "Resident Evil 4",
      cover: null,
      released: 1679616000,
      year: 2023,
      platforms: [6, 167, 169],
      genres: ["Шутер", "Приключения"],
      critics: 92,
      users: 8.8,
      type: 8,
      hypes: null,
    });
  });

  it("maps platforms to the four groups and back", () => {
    expect(groupsOf([167, 6, 3])).toEqual(["pc", "playstation"]);
    expect(platformIds(["xbox", "nintendo"])).toEqual([169, 49, 508, 130]);
  });

  it("ranks games high in several popularity lists first", () => {
    const score = fuse([
      [1, 2, 3],
      [3, 2],
      [3, 9],
    ]);
    const order = [1, 2, 3, 9].sort(
      (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0),
    );
    expect(order).toEqual([3, 2, 1, 9]);
  });

  it("keeps quotes out of IGDB strings and pins queries to the day", () => {
    expect(clean(' Baldur\'s "Gate" \\ 3 ')).toBe("Baldur's Gate 3");
    expect(today(Date.UTC(2026, 9, 1, 15, 30))).toBe(
      Date.UTC(2026, 9, 1) / 1000,
    );
  });

  it("finds the Steam app among store links", () => {
    expect(steamAppId(game)).toBe(2050650);
    expect(steamAppId({ id: 2, name: "Zelda" })).toBeNull();
  });
});

describe("game facts", () => {
  it("groups release dates by day and keeps the first one per platform", () => {
    expect(releaseRows(game)).toEqual([
      { day: "2023-03-24", date: "24 марта 2023", platforms: ["PC", "PS5"] },
      {
        day: "2023-11-14",
        date: "14 ноября 2023",
        platforms: ["Series X|S"],
      },
    ]);
  });

  it("lists platforms PC first, then PlayStation, Xbox, Nintendo", () => {
    expect(
      platformList({
        ...game,
        platforms: [
          { id: 130, abbreviation: "Switch" },
          { id: 49, abbreviation: "XONE" },
          { id: 48, abbreviation: "PS4" },
          { id: 6, abbreviation: "PC" },
          { id: 167, abbreviation: "PS5" },
        ],
      }),
    ).toEqual(["PC", "PS5", "PS4", "XONE", "Switch"]);
  });

  it("describes multiplayer and time to beat", () => {
    expect(multiplayerLabel(game)).toBe(
      "онлайн до 4 игроков, кооператив по сети до 2",
    );
    expect(hours(16 * 3600 + 1200)).toBe("16 ч");
    expect(hours(1200)).toBe("20 мин");
    expect(
      timeToBeatLabel({
        hastily: 54000,
        normally: 72000,
        completely: null,
        count: 10,
      }),
    ).toEqual([
      ["Сюжет", "15 ч"],
      ["Сюжет и побочное", "20 ч"],
    ]);
  });

  it("orders age ratings with PEGI first and readable values", () => {
    expect(
      ageLabels([
        { org: "ESRB", rating: "M" },
        { org: "PEGI", rating: "Eighteen" },
        { org: "USK", rating: "18" },
      ]),
    ).toEqual(["PEGI 18", "ESRB M"]);
  });

  it("lists real stores, then searches for missing console stores", () => {
    const { stores, other } = gameLinks(game, 2050650);
    expect(stores.map((s) => [s.label, !!s.search])).toEqual([
      ["Steam", false],
      ["PlayStation Store", true],
      ["Microsoft Store", true],
    ]);
    expect(stores[1].href).toBe(
      "https://store.playstation.com/search/Resident%20Evil%204",
    );
    expect(other.map((o) => o.label)).toEqual([
      "Официальный сайт",
      "Википедия",
      "IGDB",
    ]);
  });
});

describe("old library entries", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("move to IGDB ids, keeping the newer entry on a clash", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const entry = {
      title: "x",
      thumbnail: "",
      year: "",
      genre: "",
      status: "played",
      rating: 8,
      note: "",
    };
    store.set(
      "umbra.gamesLibrary",
      JSON.stringify([
        { ...entry, id: 620, title: "Portal 2", updatedAt: 1 },
        { ...entry, id: 101181335, title: "Village", updatedAt: 2 },
        {
          ...entry,
          id: 72,
          title: "Portal 2 new",
          updatedAt: 5,
          source: "igdb",
        },
        { ...entry, id: 999, title: "Unknown", updatedAt: 3 },
      ]),
    );
    const lib = await import("../../src/lib/gameLibrary");
    expect(lib.legacyGames().map((g) => g.id)).toEqual([620, 101181335, 999]);
    lib.moveToIgdb(
      new Map([
        [620, 72],
        [101181335, 1940],
      ]),
    );
    const rows = JSON.parse(store.get("umbra.gamesLibrary")!) as Array<{
      id: number;
      title: string;
      source?: string;
    }>;
    expect(rows.map((r) => [r.id, r.title, r.source ?? "old"])).toEqual([
      [72, "Portal 2 new", "igdb"],
      [999, "Unknown", "old"],
      [1940, "Village", "igdb"],
    ]);
  });
});
