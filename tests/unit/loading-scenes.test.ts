import { describe, expect, it } from "vitest";
import {
  HERO_SCENE_TIME,
  SCENE_POOLS,
  pickLoadingScene,
  renderLoadingSceneSvg,
  solveJoint,
  type LoadingSceneId,
} from "../../src/lib/loadingScenes";

describe("loading motion scenes", () => {
  it("maps each loading context to its exact randomized scene pool", () => {
    expect(SCENE_POOLS.auth).toEqual(["auth-room", "auth-corridor"]);
    expect(SCENE_POOLS.movie).toEqual(["card-projector", "card-ladder"]);
    expect(SCENE_POOLS.game).toEqual(["card-cartridge", "card-ladder"]);

    expect(pickLoadingScene("auth", () => 0.1)).toBe("auth-room");
    expect(pickLoadingScene("auth", () => 0.85)).toBe("auth-corridor");

    expect(pickLoadingScene("movie", () => 0.2)).toBe("card-projector");
    expect(pickLoadingScene("movie", () => 0.7)).toBe("card-ladder");

    expect(pickLoadingScene("game", () => 0.2)).toBe("card-cartridge");
    expect(pickLoadingScene("game", () => 0.7)).toBe("card-ladder");

    // Edge & out-of-range random values never throw or go out of bounds
    expect(pickLoadingScene("auth", () => 1)).toBe("auth-corridor");
    expect(pickLoadingScene("game", () => -5)).toBe("card-cartridge");
    expect(pickLoadingScene("movie", () => Number.NaN)).toBe("card-projector");
  });

  it("solves 2-bone inverse kinematics with forward knees, downward elbows and safe clamping", () => {
    // Standing leg facing right (+X): knee bends forward (+X) when bendDir = -1
    const [kneeX, kneeY] = solveJoint(100, 68, 100, 86, 9.6, 9.6, -1);
    expect(kneeX).toBeGreaterThan(100);
    expect(Math.hypot(kneeX - 100, kneeY - 68)).toBeCloseTo(9.6, 5);
    expect(Math.hypot(100 - kneeX, 86 - kneeY)).toBeCloseTo(9.6, 5);

    // Reaching arm forward-up: elbow drops below shoulder->hand line when bendDir = +1
    const [elbX, elbY] = solveJoint(100, 57, 110, 47, 7.6, 7.6, 1);
    expect(elbY).toBeGreaterThan(52); // midpoint y is 52; elbow sits below it
    expect(Math.hypot(elbX - 100, elbY - 57)).toBeCloseTo(7.6, 5);

    // Zero-distance and over-extended targets never produce NaN
    const [zeroX, zeroY] = solveJoint(50, 50, 50, 50, 8, 8, -1);
    expect(Number.isFinite(zeroX) && Number.isFinite(zeroY)).toBe(true);

    const [farX, farY] = solveJoint(0, 0, 200, 0, 8, 8, 1);
    expect(Number.isFinite(farX) && Number.isFinite(farY)).toBe(true);
  });

  it("renders valid, finite, ID-scoped SVG markup across all scenes and timestamps", () => {
    const scenes: LoadingSceneId[] = [
      "auth-room",
      "auth-corridor",
      "card-projector",
      "card-cartridge",
      "card-ladder",
    ];
    const times = [0, 0.25, 1.4, 3.1, 6.2, -1, Number.NaN];

    for (const scene of scenes) {
      for (const t of [...times, HERO_SCENE_TIME[scene]]) {
        const svg = renderLoadingSceneSvg(scene, t, "u42");
        expect(svg.length).toBeGreaterThan(150);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("Infinity");
        expect(svg).not.toContain("undefined");
      }
    }

    // Hero frame of auth-room has both the floor lamp and PC glow active with scoped IDs
    const roomHero = renderLoadingSceneSvg(
      "auth-room",
      HERO_SCENE_TIME["auth-room"],
      "scopeA",
    );
    expect(roomHero).toContain("url(#scopeA-lampCone)");
    expect(roomHero).toContain("url(#scopeA-pcGlow)");

    // Hero frame of auth-corridor illuminates shelves via scoped flashlight clipPath
    const corridorHero = renderLoadingSceneSvg(
      "auth-corridor",
      HERO_SCENE_TIME["auth-corridor"],
      "scopeB",
    );
    expect(corridorHero).toContain("url(#scopeB-flashClip)");
  });
});
