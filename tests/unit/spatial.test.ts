import { describe, expect, it } from "vitest";
import { nextIndex, type Box } from "../../src/lib/spatial";
import { appForProvider, detectTvMode, watchApps } from "../../src/lib/tvMode";

const box = (left: number, top: number, w = 100, h = 150): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

/** Two rows of posters, 110 px apart; the second row is scrolled by half a card. */
const row1 = [0, 110, 220, 330].map((x) => box(x, 0));
const row2 = [-50, 60, 170, 280].map((x) => box(x, 200));
const all = [...row1, ...row2];

describe("spatial navigation", () => {
  it("follows a row left and right", () => {
    expect(nextIndex(row1[1], all, "right")).toBe(2);
    expect(nextIndex(row1[1], all, "left")).toBe(0);
    expect(nextIndex(row1[3], all, "right")).toBe(-1);
    expect(nextIndex(row1[0], all, "left")).toBe(-1);
  });

  it("moves down to the card under the centre, then back up", () => {
    // Centre of row1[2] is x=270: row2[2] (170–270) and row2[3] (280–380) are
    // equally far; the one overlapping wins.
    expect(nextIndex(row1[2], all, "down")).toBe(6);
    expect(nextIndex(row2[1], all, "up")).toBe(1);
    expect(nextIndex(row1[0], all, "up")).toBe(-1);
    expect(nextIndex(row2[0], all, "down")).toBe(-1);
  });

  it("prefers an element in line over a nearer diagonal one", () => {
    const from = box(0, 0, 100, 40);
    const diagonal = box(120, 60, 100, 40);
    const inLine = box(300, 0, 100, 40);
    expect(nextIndex(from, [from, diagonal, inLine], "right")).toBe(2);
  });

  it("reaches a wide element below from any column", () => {
    const keys = [0, 50, 100, 150].map((x) => box(x, 0, 40, 40));
    const space = box(0, 50, 200, 40);
    const boxes = [...keys, space];
    keys.forEach((k) => expect(nextIndex(k, boxes, "down")).toBe(4));
    // Up from the wide key: the key nearest its centre (x=100).
    expect(nextIndex(space, boxes, "up")).toBe(2);
  });

  it("skips elements it overlaps by more than half", () => {
    const card = box(0, 0, 400, 200);
    const inside = box(20, 150, 100, 40);
    const below = box(0, 220, 400, 60);
    expect(nextIndex(card, [card, inside, below], "down")).toBe(2);
  });
});

describe("TV mode", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it("turns on with ?tv=1 and stays on for the session", () => {
    const session = memory();
    expect(detectTvMode("", session)).toBe(false);
    expect(detectTvMode("?tv=1", session)).toBe(true);
    expect(detectTvMode("", session)).toBe(true);
    expect(detectTvMode("?tv=0", session)).toBe(false);
    expect(detectTvMode("", session)).toBe(false);
  });

  it("is on inside the TV app even without the flag", () => {
    const ua = "Mozilla/5.0 (Linux; Android 12) Chrome/156 UmbraTV/1.0.42";
    expect(detectTvMode("", memory(), ua)).toBe(true);
    expect(detectTvMode("?tv=0", memory(), ua)).toBe(false);
  });

  it("works without session storage", () => {
    expect(detectTvMode("?tv=1", null)).toBe(true);
    expect(detectTvMode("", null)).toBe(false);
  });
});

describe("watch on TV", () => {
  const p = (provider_name: string, provider_id = 1) => ({
    provider_id,
    provider_name,
  });

  it("knows streaming apps by name", () => {
    expect(appForProvider("Netflix")).toBe("netflix");
    expect(appForProvider("Netflix basic with Ads")).toBe("netflix");
    expect(appForProvider("Amazon Prime Video")).toBe("prime");
    expect(appForProvider("Apple TV Plus")).toBe("apple");
    expect(appForProvider("Max")).toBe("max");
    expect(appForProvider("MEGOGO")).toBe("megogo");
    expect(appForProvider("Maxdome")).toBe(null);
    expect(appForProvider("Kyivstar TV")).toBe(null);
  });

  it("offers installed apps, subscriptions first, each once", () => {
    const offers = {
      buy: [p("Apple TV"), p("YouTube")],
      flatrate: [p("Netflix"), p("Disney Plus")],
      rent: [p("Apple TV"), p("Amazon Video")],
    };
    const installed = { netflix: true, apple: true, prime: true };
    expect(watchApps(offers, installed)).toEqual([
      { app: "netflix", name: "Netflix", offer: "по подписке" },
      { app: "apple", name: "Apple TV", offer: "аренда" },
      { app: "prime", name: "Amazon Video", offer: "аренда" },
    ]);
    expect(watchApps(undefined, installed)).toEqual([]);
  });
});
