import { describe, expect, it } from "vitest";
import { moveFocus, settle, type Lane } from "../../src/tv/lanes";

const lanes: Lane[] = [
  { key: "tabs", size: 4 },
  { key: "continue", size: 0 },
  { key: "new", size: 10 },
  { key: "top", size: 3 },
];

describe("TV lanes", () => {
  it("moves inside a lane and stops at its ends", () => {
    const s = { lane: "new", cols: {} };
    const right = moveFocus(s, lanes, "right")!;
    expect(right.cols.new).toBe(1);
    expect(moveFocus(s, lanes, "left")).toBeNull();
    expect(
      moveFocus({ lane: "top", cols: { top: 2 } }, lanes, "right"),
    ).toBeNull();
  });

  it("skips empty lanes and keeps each lane's position", () => {
    let s = moveFocus({ lane: "tabs", cols: {} }, lanes, "down")!;
    expect(s.lane).toBe("new");
    s = { ...s, cols: { ...s.cols, new: 6 } };
    s = moveFocus(s, lanes, "down")!;
    expect(s.lane).toBe("top");
    s = moveFocus(s, lanes, "up")!;
    expect(s).toEqual({ lane: "new", cols: { new: 6 } });
    expect(moveFocus({ lane: "tabs", cols: {} }, lanes, "up")).toBeNull();
    expect(moveFocus(s, lanes, "down")!.lane).toBe("top");
  });

  it("falls to the nearest lane when its own empties or is not there yet", () => {
    expect(settle({ lane: "continue", cols: {} }, lanes).lane).toBe("new");
    expect(settle({ lane: null, cols: {} }, lanes).lane).toBe("tabs");
    expect(settle({ lane: "gone", cols: {} }, lanes).lane).toBe("tabs");
    const last = [...lanes.slice(0, 3), { key: "top", size: 0 }];
    expect(settle({ lane: "top", cols: {} }, last).lane).toBe("new");
    expect(settle({ lane: "x", cols: {} }, []).lane).toBeNull();
  });
});
