import { it, expect, vi, beforeEach, afterEach } from "vitest";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const game = {
  id: 620,
  title: "Portal 2",
  thumbnail: "",
  year: "2011",
  genre: "Puzzle",
  status: "played" as const,
  rating: 8,
  note: "My note",
  updatedAt: 1,
};
it("reports storage failures instead of pretending the game was saved", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
  });
  const { saveGame } = await import("../../src/lib/gameLibrary");
  expect(() => saveGame(game)).toThrow("Не удалось сохранить");
});
it("rejects nonfinite ratings before writing storage", async () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem });
  const { saveGame } = await import("../../src/lib/gameLibrary");
  expect(() => saveGame({ ...game, rating: NaN })).toThrow();
  expect(setItem).not.toHaveBeenCalled();
});
