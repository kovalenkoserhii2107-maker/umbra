import { describe, expect, it } from "vitest";
import { splitYear, switchLayout } from "../../src/lib/search";

describe("search input helpers", () => {
  it("fixes text typed on the wrong keyboard layout", () => {
    expect(switchLayout("l.yf")).toBe("дюна");
    expect(switchLayout("ЬФЕКШЧ")).toBe("matrix");
    expect(switchLayout("дюна")).toBe("l.yf");
    // Mixed or digit-only text is left alone.
    expect(switchLayout("дюна dune")).toBeNull();
    expect(switchLayout("2049")).toBeNull();
  });

  it("takes a trailing year off the query", () => {
    expect(splitYear("дюна 2021")).toEqual({ text: "дюна", year: "2021" });
    expect(splitYear("  1917 ")).toEqual({ text: "1917", year: "" });
    expect(splitYear("бегущий по лезвию 2049")).toEqual({
      text: "бегущий по лезвию",
      year: "2049",
    });
  });
});
