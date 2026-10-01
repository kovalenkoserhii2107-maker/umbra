import { describe, expect, it } from "vitest";
import { REMIND_AFTER, mayRemind, parseDismissal } from "../../src/lib/install";

describe("install prompt reminders", () => {
  const now = 10 * REMIND_AFTER;
  it("asks a new person and once more a week after the first «Позже»", () => {
    expect(mayRemind(null, now)).toBe(true);
    const once = JSON.stringify({ at: now - 1000, count: 1 });
    expect(mayRemind(once, now)).toBe(false);
    expect(mayRemind(once, now + REMIND_AFTER)).toBe(true);
  });
  it("stops after the second «Позже»", () => {
    const twice = JSON.stringify({ at: 0, count: 2 });
    expect(mayRemind(twice, now)).toBe(false);
  });
  it("treats the old stored flag as a first dismissal from long ago", () => {
    expect(parseDismissal("1")).toEqual({ at: 0, count: 1 });
    expect(mayRemind("1", now)).toBe(true);
    expect(mayRemind("not json", now)).toBe(true);
  });
});
