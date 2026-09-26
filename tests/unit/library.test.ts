import { describe, expect, it } from "vitest";
import { parseImport, parseItem } from "../../src/lib/library";
const item = {
  id: 1,
  type: "movie",
  title: "Film",
  poster: "",
  year: "2026",
  status: "watchlist",
  rating: null,
  note: "",
  updatedAt: 1,
};
describe("library validation and migration", () => {
  it("omits undefined optional fields before Firestore serialization", () => {
    const parsed = parseItem({
      ...item,
      season: undefined,
      episode: undefined,
    });
    expect(Object.hasOwn(parsed, "season")).toBe(false);
    expect(Object.values(parsed)).not.toContain(undefined);
  });
  it.each([
    null,
    {},
    { ...item, rating: 11 },
    { ...item, note: "x".repeat(5001) },
    { ...item, id: -1 },
    { ...item, status: "admin" },
    { ...item, poster: "javascript:alert(1)" },
  ])("rejects invalid rows atomically", (value) => {
    expect(() =>
      parseImport(JSON.stringify({ items: [item, value] })),
    ).toThrow();
  });
  it("supports old exports but deduplicates rows and strips unexpected fields", () => {
    const rows = parseImport(
      JSON.stringify({
        items: [item, { ...item, note: "new", role: "admin" }],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("new");
    expect(rows[0]).not.toHaveProperty("role");
  });
  it("rejects unknown export versions", () =>
    expect(() =>
      parseImport(JSON.stringify({ version: 2, items: [item] })),
    ).toThrow());
});
