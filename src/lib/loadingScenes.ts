export type LoadingKind = "auth" | "movie" | "game";

export type LoadingSceneId =
  | "auth-room"
  | "auth-corridor"
  | "card-projector"
  | "card-cartridge"
  | "card-ladder";

export const SCENE_POOLS: Record<LoadingKind, readonly LoadingSceneId[]> = {
  auth: ["auth-room", "auth-corridor"],
  movie: ["card-projector", "card-ladder"],
  game: ["card-cartridge", "card-ladder"],
};

/** Representative lit frame rendered when `prefers-reduced-motion: reduce` is active. */
export const HERO_SCENE_TIME: Record<LoadingSceneId, number> = {
  "auth-room": 5.0,
  "auth-corridor": 2.2,
  "card-projector": 2.1,
  "card-cartridge": 1.95,
  "card-ladder": 2.65,
};

type Point = readonly [number, number];

const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, v));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const sub = (t: number, a: number, b: number): number =>
  clamp((t - a) / (b - a), 0, 1);

export function pickLoadingScene(
  kind: LoadingKind,
  rand: () => number = Math.random,
): LoadingSceneId {
  const pool = SCENE_POOLS[kind];
  const sample = rand();
  const r = clamp(Number.isFinite(sample) ? sample : 0, 0, 0.999999);
  const idx = Math.floor(r * pool.length);
  return pool[idx] ?? pool[0];
}

/**
 * 2-bone 2D inverse kinematics in SVG screen coordinates (+X right, +Y down).
 * For a character facing right (+X):
 *   - `bendDir = -1` bends knees forward (+X)
 *   - `bendDir = +1` drops elbows naturally downward
 */
export function solveJoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  bendDir: 1 | -1,
): Point {
  const dx = bx - ax;
  const dy = by - ay;
  const rawD = Math.hypot(dx, dy) || 0.0001;
  const d = clamp(rawD, Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.05);
  const baseAngle = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const angle = baseAngle + bendDir * Math.acos(cosA);
  return [ax + Math.cos(angle) * l1, ay + Math.sin(angle) * l1];
}

interface ActorPose {
  hipX: number;
  hipY: number;
  lean?: number;
  torsoH?: number;
  headTilt?: number;
  headNodY?: number;
  footL: Point;
  footR: Point;
  handL: Point;
  handR: Point;
  kneeDir?: 1 | -1;
  elbowDirL?: 1 | -1;
  elbowDirR?: 1 | -1;
  alpha?: number;
}

function renderActor(p: ActorPose): string {
  const {
    hipX,
    hipY,
    lean = 0,
    torsoH = 12.2,
    headTilt = 0,
    headNodY = 0,
    footL,
    footR,
    handL,
    handR,
    kneeDir = -1,
    elbowDirL = 1,
    elbowDirR = 1,
    alpha = 1,
  } = p;

  const neckX = hipX + lean;
  const neckY = hipY - torsoH;
  const shX = hipX + lean * 0.85;
  const shY = neckY + 1.4;

  const headX = neckX + lean * 0.18 + headTilt * 1.4;
  const headY = neckY - 5.6 + headNodY;

  const midX = (hipX + neckX) * 0.5 - lean * 0.22;
  const midY = (hipY + neckY) * 0.5;

  const [kneeLx, kneeLy] = solveJoint(
    hipX,
    hipY,
    footL[0],
    footL[1],
    9.6,
    9.6,
    kneeDir,
  );
  const [kneeRx, kneeRy] = solveJoint(
    hipX,
    hipY,
    footR[0],
    footR[1],
    9.6,
    9.6,
    kneeDir,
  );
  const [elbLx, elbLy] = solveJoint(
    shX,
    shY,
    handL[0],
    handL[1],
    7.6,
    7.6,
    elbowDirL,
  );
  const [elbRx, elbRy] = solveJoint(
    shX,
    shY,
    handR[0],
    handR[1],
    7.6,
    7.6,
    elbowDirR,
  );

  return (
    `<g opacity="${alpha.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.65">` +
    `<path d="M ${hipX.toFixed(2)} ${hipY.toFixed(2)} L ${kneeLx.toFixed(2)} ${kneeLy.toFixed(2)} L ${footL[0].toFixed(2)} ${footL[1].toFixed(2)}" stroke="#8a8a8a" />` +
    `<path d="M ${shX.toFixed(2)} ${shY.toFixed(2)} L ${elbLx.toFixed(2)} ${elbLy.toFixed(2)} L ${handL[0].toFixed(2)} ${handL[1].toFixed(2)}" stroke="#8a8a8a" />` +
    `<path d="M ${neckX.toFixed(2)} ${neckY.toFixed(2)} Q ${midX.toFixed(2)} ${midY.toFixed(2)} ${hipX.toFixed(2)} ${hipY.toFixed(2)}" stroke="#fcfcfc" />` +
    `<circle cx="${headX.toFixed(2)}" cy="${headY.toFixed(2)}" r="3.9" stroke="#fcfcfc" fill="#000000" />` +
    `<path d="M ${hipX.toFixed(2)} ${hipY.toFixed(2)} L ${kneeRx.toFixed(2)} ${kneeRy.toFixed(2)} L ${footR[0].toFixed(2)} ${footR[1].toFixed(2)}" stroke="#fcfcfc" />` +
    `<path d="M ${shX.toFixed(2)} ${shY.toFixed(2)} L ${elbRx.toFixed(2)} ${elbRy.toFixed(2)} L ${handR[0].toFixed(2)} ${handR[1].toFixed(2)}" stroke="#fcfcfc" />` +
    `</g>`
  );
}

function walkFeetAndBob(
  x: number,
  stridePhase: number,
  strideAmp = 6.0,
  liftAmp = 3.1,
  floorY = 88,
): { footL: Point; footR: Point; hipY: number; swing: number } {
  const a = stridePhase * Math.PI * 2;
  const lX = x + Math.sin(a) * strideAmp;
  const rX = x - Math.sin(a) * strideAmp;
  const lY = floorY - Math.max(0, Math.cos(a)) * liftAmp;
  const rY = floorY - Math.max(0, -Math.cos(a)) * liftAmp;
  const bob = Math.abs(Math.cos(a)) * 1.1;
  return {
    footL: [lX, lY],
    footR: [rX, rY],
    hipY: floorY - 17.8 - bob,
    swing: Math.sin(a),
  };
}

function cycleFade(
  timeSec: number,
  t: number,
  inEdge = 0.08,
  outEdge = 0.9,
): number {
  if (t > outEdge) return smooth((1 - t) / (1 - outEdge));
  if (t < inEdge) {
    // First cycle starts immediately readable (0.45 -> 1) even on fast 200ms loads.
    const floor = timeSec < 0.4 ? 0.45 : 0;
    return lerp(floor, 1, smooth(t / inEdge));
  }
  return 1;
}

// ---- Auth 1: Door -> Floor Lamp -> Chair & PC Desk with Monitor Light ----

function drawAuthRoom(timeSec: number, idPrefix: string): string {
  const dur = 6.6;
  const t = (timeSec % dur) / dur;
  const fade = cycleFade(timeSec, t, 0.05, 0.93);
  const floorY = 88;

  const doorOpen =
    t < 0.14 ? smooth(sub(t, 0.01, 0.09)) : 1 - smooth(sub(t, 0.14, 0.24));

  const lampLit = t >= 0.36 ? smooth(sub(t, 0.36, 0.42)) * fade : 0;
  const pcOn = t >= 0.66 ? smooth(sub(t, 0.66, 0.72)) * fade : 0;

  let hipX: number;
  let hipY: number;
  let footL: Point;
  let footR: Point;
  let handL: Point;
  let handR: Point;
  let lean = 1.6;
  let headTilt = 0.4;
  let headNodY = 0;

  const pullDown =
    t >= 0.33 && t < 0.39
      ? Math.sin(sub(t, 0.33, 0.39) * Math.PI) * 5.8
      : t >= 0.39 && t < 0.47
        ? -Math.sin(sub(t, 0.39, 0.47) * Math.PI * 2) *
          1.4 *
          (1 - sub(t, 0.39, 0.47))
        : 0;
  const cordTipY = 50 + pullDown;

  if (t < 0.28) {
    const wP = smooth(sub(t, 0.03, 0.28));
    hipX = lerp(29, 90, wP);
    const taper = 1 - sub(t, 0.23, 0.28);
    const w = walkFeetAndBob(
      hipX,
      sub(t, 0.03, 0.28) * 2.5,
      5.6 * taper,
      3.0 * taper,
      floorY,
    );
    hipY = w.hipY;
    footL = [Math.max(23.5, w.footL[0]), w.footL[1]];
    footR = [Math.max(23.5, w.footR[0]), w.footR[1]];
    handL = [Math.max(24, hipX - 3.4 - w.swing * 4.2), hipY - 3];
    handR = [hipX + 3.6 + w.swing * 4.2, hipY - 3];
  } else if (t < 0.41) {
    hipX = 90;
    const dip = pullDown * 0.25;
    hipY = floorY - 17.8 + dip;
    footL = [87.5, floorY];
    footR = [92.5, floorY];
    const reachP = smooth(sub(t, 0.28, 0.34));
    const relP = smooth(sub(t, 0.38, 0.41));
    handL = [86.5, hipY - 3];
    const restR: Point = [93.5, hipY - 3];
    const target: Point = [99, cordTipY];
    handR =
      t < 0.38
        ? [
            lerp(restR[0], target[0], reachP),
            lerp(restR[1], target[1], reachP),
          ]
        : [lerp(target[0], restR[0], relP), lerp(target[1], restR[1], relP)];
    lean = 1.4 + reachP * (1 - relP) * 1.4;
    headTilt = 0.7;
  } else if (t < 0.56) {
    const wP = smooth(sub(t, 0.41, 0.56));
    hipX = lerp(90, 157, wP);
    const taper = 1 - sub(t, 0.52, 0.56);
    const w = walkFeetAndBob(
      hipX,
      sub(t, 0.41, 0.56) * 2.6,
      6.0 * taper,
      3.0 * taper,
      floorY,
    );
    hipY = w.hipY;
    footL = w.footL;
    footR = w.footR;
    handL = [hipX - 3.4 - w.swing * 4.4, hipY - 3];
    handR = [hipX + 3.6 + w.swing * 4.4, hipY - 3];
    lean = 1.7;
  } else {
    const sitP = smooth(sub(t, 0.56, 0.64));
    hipX = lerp(157, 158, sitP);
    hipY = lerp(floorY - 17.8, 75.5, sitP);

    footL = [lerp(154.5, 165.0, sitP), floorY];
    footR = [lerp(159.5, 167.5, sitP), floorY];

    const browsePhase = sub(t, 0.68, 0.92);
    const mouseNudge = pcOn > 0.5 ? Math.sin(browsePhase * Math.PI * 4) * 1.2 : 0;
    const curiousLean =
      pcOn > 0.5 ? Math.sin(browsePhase * Math.PI * 2) * 0.8 + 0.6 : 0;
    headNodY = pcOn > 0.5 ? Math.sin(browsePhase * Math.PI * 3) * 0.7 : 0;

    handL = [lerp(154, 171.5, sitP), lerp(hipY - 3, 67.6, sitP)];
    handR = [lerp(160, 175.0 + mouseNudge, sitP), lerp(hipY - 3, 67.6, sitP)];
    lean = lerp(1.6, 2.2 + curiousLean, sitP);
    headTilt = lerp(0.4, 0.65, sitP);
  }

  const leafW = lerp(22, 7.5, doorOpen);
  const leafTopY = lerp(26, 29.0, doorOpen);
  const leafBotY = lerp(88, 85.0, doorOpen);
  const knobX = 22 + leafW - 2.6;
  const knobY = (leafTopY + leafBotY) * 0.51;

  const roomStroke = lampLit > 0.1 ? "#8e8e8e" : "#262626";
  const deskStroke = lampLit > 0.1 ? "#d4d4d4" : "#2b2b2b";
  const roomOpacity = lerp(0.42, 1.0, lampLit);

  const rayPulse = 0.84 + 0.16 * Math.sin(timeSec * 14);
  const rayReach = smooth(sub(t, 0.66, 0.73));

  const lampConeId = `${idPrefix}-lampCone`;
  const pcGlowId = `${idPrefix}-pcGlow`;

  return (
    `<defs>` +
    `<linearGradient id="${lampConeId}" x1="106" y1="32" x2="106" y2="88" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="#ff9e64" stop-opacity="${(0.26 * lampLit).toFixed(3)}" />` +
    `<stop offset="100%" stop-color="#ff9e64" stop-opacity="0" />` +
    `</linearGradient>` +
    `<linearGradient id="${pcGlowId}" x1="194" y1="53" x2="162" y2="53" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="#ff9e64" stop-opacity="${(0.25 * pcOn * rayPulse).toFixed(3)}" />` +
    `<stop offset="100%" stop-color="#ff9e64" stop-opacity="0" />` +
    `</linearGradient>` +
    `</defs>` +
    `<line x1="14" y1="${floorY}" x2="226" y2="${floorY}" stroke="#212121" stroke-width="1.2" stroke-linecap="round" />` +
    `<g opacity="${fade.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">` +
    (doorOpen > 0.03
      ? `<rect x="22.5" y="26.5" width="21" height="61" fill="rgba(255,158,100,${(0.08 * doorOpen).toFixed(3)})" />`
      : "") +
    `<path d="M 22 ${floorY} L 22 26 L 44 26 L 44 ${floorY}" stroke="#525252" stroke-width="1.45" />` +
    `<polygon points="22,26 ${(22 + leafW).toFixed(1)},${leafTopY.toFixed(1)} ${(22 + leafW).toFixed(1)},${leafBotY.toFixed(1)} 22,${floorY}" fill="#050505" stroke="#787878" stroke-width="1.35" />` +
    `<circle cx="${knobX.toFixed(1)}" cy="${knobY.toFixed(1)}" r="1.3" fill="#ff9e64" />` +
    `</g>` +
    (lampLit > 0.01
      ? `<polygon points="97,32 115,32 166,${floorY} 62,${floorY}" fill="url(#${lampConeId})" />` +
        `<line x1="68" y1="${floorY}" x2="162" y2="${floorY}" stroke="#ff9e64" stroke-opacity="${(0.45 * lampLit).toFixed(3)}" stroke-width="1.4" stroke-linecap="round" />`
      : "") +
    `<g opacity="${fade.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<line x1="100" y1="${floorY}" x2="112" y2="${floorY}" stroke="${lampLit > 0.1 ? "#fcfcfc" : "#7a7a7a"}" stroke-width="1.55" />` +
    `<line x1="106" y1="${floorY}" x2="106" y2="32" stroke="${lampLit > 0.1 ? "#fcfcfc" : "#7a7a7a"}" stroke-width="1.45" />` +
    `<line x1="99" y1="32" x2="99" y2="${cordTipY.toFixed(2)}" stroke="#8e8e8e" stroke-width="1.15" />` +
    `<circle cx="99" cy="${cordTipY.toFixed(2)}" r="1.85" fill="#ff9e64" />` +
    `<polygon points="97,32 115,32 111,20 101,20" fill="${lampLit > 0.2 ? "rgba(255,158,100,0.18)" : "#000000"}" stroke="${lampLit > 0.2 ? "#ff9e64" : "#8e8e8e"}" stroke-width="1.55" />` +
    `</g>` +
    `<g opacity="${(roomOpacity * fade).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M 151 62 L 154 77 L 164 77" stroke="${roomStroke}" stroke-width="1.5" />` +
    `<line x1="158.5" y1="77" x2="158.5" y2="${floorY}" stroke="${roomStroke}" stroke-width="1.45" />` +
    `<line x1="153.5" y1="${floorY}" x2="163.5" y2="${floorY}" stroke="${roomStroke}" stroke-width="1.45" />` +
    `<line x1="169" y1="69" x2="213" y2="69" stroke="${deskStroke}" stroke-width="1.6" />` +
    `<line x1="172" y1="69" x2="172" y2="${floorY}" stroke="${roomStroke}" stroke-width="1.4" />` +
    `<line x1="210" y1="69" x2="210" y2="${floorY}" stroke="${roomStroke}" stroke-width="1.4" />` +
    `<line x1="171" y1="67.3" x2="180" y2="67.3" stroke="${pcOn > 0.3 ? "#fcfcfc" : roomStroke}" stroke-width="1.35" />` +
    `<path d="M 198.5 54 L 202.5 69" stroke="${roomStroke}" stroke-width="1.5" />` +
    `<line x1="196" y1="69" x2="206" y2="69" stroke="${roomStroke}" stroke-width="1.5" />` +
    `<polygon points="193.5,45 197.5,45.8 199.5,60.2 195.5,60.8" fill="#050505" stroke="${pcOn > 0.2 ? "#fcfcfc" : deskStroke}" stroke-width="1.45" />` +
    (pcOn > 0.15
      ? `<line x1="193.5" y1="45.4" x2="195.5" y2="60.4" stroke="#ff9e64" stroke-width="1.9" />`
      : "") +
    `</g>` +
    (pcOn > 0.05
      ? `<polygon points="193,45.5 162,38 162,66 195,60.5" fill="url(#${pcGlowId})" />` +
        `<g opacity="${(pcOn * rayPulse).toFixed(3)}" stroke-linecap="round">` +
        `<line x1="190.5" y1="46.5" x2="${lerp(190.5, 176.5, rayReach).toFixed(1)}" y2="${lerp(46.5, 42.2, rayReach).toFixed(1)}" stroke="#ff9e64" stroke-width="1.35" />` +
        `<line x1="190.8" y1="50.8" x2="${lerp(190.8, 172.5, rayReach).toFixed(1)}" y2="${lerp(50.8, 49.0, rayReach).toFixed(1)}" stroke="#fcfcfc" stroke-width="1.2" stroke-opacity="0.85" />` +
        `<line x1="191.2" y1="55.0" x2="${lerp(191.2, 173.5, rayReach).toFixed(1)}" y2="${lerp(55.0, 55.8, rayReach).toFixed(1)}" stroke="#ff9e64" stroke-width="1.35" />` +
        `<line x1="191.8" y1="59.2" x2="${lerp(191.8, 178.0, rayReach).toFixed(1)}" y2="${lerp(59.2, 62.2, rayReach).toFixed(1)}" stroke="#fcfcfc" stroke-width="1.15" stroke-opacity="0.7" />` +
        `</g>`
      : "") +
    renderActor({
      hipX,
      hipY,
      lean,
      headTilt,
      headNodY,
      footL,
      footR,
      handL,
      handR,
      alpha: fade,
    })
  );
}

// ---- Auth 2: Endless Corridor Passing Shelf after Shelf with Flashlight ----

const CORRIDOR_SPINES_V0: readonly (readonly [number, number, number, boolean])[] = [
  [6, 25, 41, false],
  [11, 23, 41, false],
  [17, 26, 41, true],
  [24, 24, 41, false],
  [34, 25, 41, false],
  [40, 23, 41, false],
  [48, 26, 41, false],
  [56, 24, 41, true],
  [7, 48, 63, false],
  [14, 46, 63, false],
  [21, 49, 63, false],
  [31, 46, 63, true],
  [39, 47, 63, false],
  [46, 45, 63, false],
  [55, 48, 63, false],
  [8, 70, 87, false],
  [15, 68, 87, false],
  [26, 71, 87, false],
  [35, 69, 87, false],
  [45, 68, 87, false],
  [53, 70, 87, false],
];

function renderCorridorUnit(
  unitX: number,
  variantIdx: number,
  litMode: boolean,
): string {
  const frameCol = litMode ? "#d8d8d8" : "#1c1c1c";
  const spineCol = litMode ? "#fcfcfc" : "#1b1b1b";
  const muteCol = litMode ? "#9e9e9e" : "#191919";
  const accentCol = litMode ? "#ff9e64" : "#221b16";
  const x = unitX;

  let inner = "";
  if (variantIdx === 0) {
    for (const [dx, y1, y2, acc] of CORRIDOR_SPINES_V0) {
      inner += `<line x1="${(x + dx).toFixed(1)}" y1="${y1}" x2="${(x + dx).toFixed(1)}" y2="${y2}" stroke="${acc ? accentCol : spineCol}" stroke-width="${acc && litMode ? "2.0" : "1.4"}" />`;
    }
    inner +=
      `<rect x="${(x + 82).toFixed(1)}" y="33" width="16" height="22" rx="1.5" stroke="${litMode ? accentCol : "#1b1b1b"}" stroke-width="1.35" fill="none" />` +
      `<line x1="${(x + 85).toFixed(1)}" y1="49" x2="${(x + 95).toFixed(1)}" y2="49" stroke="${muteCol}" stroke-width="1.2" />`;
  } else if (variantIdx === 1) {
    inner +=
      `<line x1="${(x + 8).toFixed(1)}" y1="24" x2="${(x + 8).toFixed(1)}" y2="41" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 14).toFixed(1)}" y1="25" x2="${(x + 14).toFixed(1)}" y2="41" stroke="${accentCol}" stroke-width="${litMode ? "2.0" : "1.4"}" />` +
      `<line x1="${(x + 21).toFixed(1)}" y1="25" x2="${(x + 27).toFixed(1)}" y2="41" stroke="${spineCol}" stroke-width="1.4" />` +
      `<rect x="${(x + 38).toFixed(1)}" y="34" width="20" height="7" rx="1" stroke="${muteCol}" stroke-width="1.3" fill="none" />` +
      `<line x1="${(x + 40).toFixed(1)}" y1="30" x2="${(x + 56).toFixed(1)}" y2="30" stroke="${accentCol}" stroke-width="1.5" />` +
      `<rect x="${(x + 8).toFixed(1)}" y="48" width="13" height="15" rx="1" stroke="${accentCol}" stroke-width="1.45" fill="none" />` +
      `<line x1="${(x + 29).toFixed(1)}" y1="46" x2="${(x + 29).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 36).toFixed(1)}" y1="48" x2="${(x + 36).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 44).toFixed(1)}" y1="45" x2="${(x + 44).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 53).toFixed(1)}" y1="47" x2="${(x + 53).toFixed(1)}" y2="63" stroke="${muteCol}" stroke-width="1.4" />` +
      `<rect x="${(x + 9).toFixed(1)}" y="71" width="20" height="16" rx="1.2" stroke="${muteCol}" stroke-width="1.3" fill="none" />` +
      `<rect x="${(x + 35).toFixed(1)}" y="71" width="22" height="16" rx="1.2" stroke="${muteCol}" stroke-width="1.3" fill="none" />` +
      `<rect x="${(x + 83).toFixed(1)}" y="40" width="14" height="8" rx="1.2" stroke="${muteCol}" stroke-width="1.25" fill="none" />`;
  } else {
    inner +=
      `<circle cx="${(x + 17).toFixed(1)}" cy="32.5" r="7" stroke="${accentCol}" stroke-width="1.45" fill="none" />` +
      `<circle cx="${(x + 17).toFixed(1)}" cy="32.5" r="1.8" fill="${accentCol}" />` +
      `<line x1="${(x + 33).toFixed(1)}" y1="24" x2="${(x + 33).toFixed(1)}" y2="41" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 40).toFixed(1)}" y1="26" x2="${(x + 40).toFixed(1)}" y2="41" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 47).toFixed(1)}" y1="23" x2="${(x + 47).toFixed(1)}" y2="41" stroke="${accentCol}" stroke-width="${litMode ? "2.0" : "1.4"}" />` +
      `<line x1="${(x + 55).toFixed(1)}" y1="25" x2="${(x + 55).toFixed(1)}" y2="41" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 8).toFixed(1)}" y1="47" x2="${(x + 8).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 15).toFixed(1)}" y1="45" x2="${(x + 15).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 23).toFixed(1)}" y1="48" x2="${(x + 23).toFixed(1)}" y2="63" stroke="${accentCol}" stroke-width="${litMode ? "2.0" : "1.4"}" />` +
      `<line x1="${(x + 34).toFixed(1)}" y1="46" x2="${(x + 34).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 42).toFixed(1)}" y1="47" x2="${(x + 42).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 51).toFixed(1)}" y1="45" x2="${(x + 51).toFixed(1)}" y2="63" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 10).toFixed(1)}" y1="69" x2="${(x + 10).toFixed(1)}" y2="87" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 18).toFixed(1)}" y1="68" x2="${(x + 18).toFixed(1)}" y2="87" stroke="${muteCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 29).toFixed(1)}" y1="70" x2="${(x + 29).toFixed(1)}" y2="87" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 38).toFixed(1)}" y1="68" x2="${(x + 38).toFixed(1)}" y2="87" stroke="${spineCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 49).toFixed(1)}" y1="71" x2="${(x + 49).toFixed(1)}" y2="87" stroke="${muteCol}" stroke-width="1.4" />` +
      `<line x1="${(x + 90).toFixed(1)}" y1="14" x2="${(x + 90).toFixed(1)}" y2="88" stroke="${litMode ? "#3a3a3a" : "#151515"}" stroke-width="1.2" />`;
  }

  return (
    `<g stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="${x.toFixed(1)}" y="19" width="66" height="69" rx="2" stroke="${frameCol}" stroke-width="1.45" fill="none" />` +
    `<line x1="${x.toFixed(1)}" y1="42" x2="${(x + 66).toFixed(1)}" y2="42" stroke="${frameCol}" stroke-width="1.3" />` +
    `<line x1="${x.toFixed(1)}" y1="64" x2="${(x + 66).toFixed(1)}" y2="64" stroke="${frameCol}" stroke-width="1.3" />` +
    inner +
    `</g>`
  );
}

function renderCorridorLayer(camX: number, litMode: boolean): string {
  const startIdx = Math.floor((camX - 40) / 114);
  let svg =
    `<line x1="8" y1="14" x2="232" y2="14" stroke="${litMode ? "#4c4c4c" : "#151515"}" stroke-width="1.15" stroke-linecap="round" />` +
    `<line x1="8" y1="88" x2="232" y2="88" stroke="${litMode ? "#ff9e64" : "#212121"}" stroke-opacity="${litMode ? "0.65" : "1"}" stroke-width="1.25" stroke-linecap="round" />`;
  for (let i = startIdx; i <= startIdx + 3; i++) {
    const worldUnitX = i * 114 + 38;
    const screenUnitX = worldUnitX - camX;
    const vIdx = ((i % 3) + 3) % 3;
    svg += renderCorridorUnit(screenUnitX, vIdx, litMode);
  }
  return svg;
}

function drawAuthCorridor(timeSec: number, idPrefix: string): string {
  const floorY = 88;
  const walkSpeed = 48;
  const worldX = timeSec * walkSpeed;

  const introFade = lerp(0.45, 1, smooth(clamp(timeSec / 0.25, 0, 1)));
  const screenX = 32 + 50 * (1 - Math.exp(-timeSec * 1.35));
  const camX = worldX - screenX;

  const strideAmp = 5.8;
  const strideCycle = 2 * Math.PI * strideAmp;
  const walk = walkFeetAndBob(
    screenX,
    worldX / strideCycle,
    strideAmp,
    2.9,
    floorY,
  );

  const aimAngle = -0.24 + Math.sin(timeSec * 2.1) * 0.22;
  const handRx = screenX + 10.6;
  const handRy = walk.hipY - 9.2 + Math.sin(timeSec * 2.1) * 1.0;

  const tipX = handRx + Math.cos(aimAngle) * 4.6;
  const tipY = handRy + Math.sin(aimAngle) * 4.6;

  const beamLen = 78;
  const spread = 0.34;
  const b1x = tipX + Math.cos(aimAngle - spread) * beamLen;
  const b1y = tipY + Math.sin(aimAngle - spread) * beamLen;
  const b2x = tipX + Math.cos(aimAngle + spread) * beamLen;
  const b2y = tipY + Math.sin(aimAngle + spread) * beamLen;

  const conePts = `${tipX.toFixed(1)},${tipY.toFixed(1)} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}`;
  const clipId = `${idPrefix}-flashClip`;
  const gradId = `${idPrefix}-flashGrad`;
  const edgeId = `${idPrefix}-corridorEdge`;

  return (
    `<defs>` +
    `<clipPath id="${clipId}"><polygon points="${conePts}" /></clipPath>` +
    `<linearGradient id="${gradId}" x1="${tipX.toFixed(1)}" y1="${tipY.toFixed(1)}" x2="${((b1x + b2x) * 0.5).toFixed(1)}" y2="${((b1y + b2y) * 0.5).toFixed(1)}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="#ff9e64" stop-opacity="${(0.35 * introFade).toFixed(3)}" />` +
    `<stop offset="100%" stop-color="#ff9e64" stop-opacity="0" />` +
    `</linearGradient>` +
    `<linearGradient id="${edgeId}" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="#000000" stop-opacity="1" />` +
    `<stop offset="10%" stop-color="#000000" stop-opacity="0" />` +
    `<stop offset="90%" stop-color="#000000" stop-opacity="0" />` +
    `<stop offset="100%" stop-color="#000000" stop-opacity="1" />` +
    `</linearGradient>` +
    `</defs>` +
    renderCorridorLayer(camX, false) +
    `<g clip-path="url(#${clipId})" opacity="${introFade.toFixed(3)}">` +
    renderCorridorLayer(camX, true) +
    `</g>` +
    `<polygon points="${conePts}" fill="url(#${gradId})" />` +
    `<g opacity="${introFade.toFixed(3)}" stroke-linecap="round">` +
    `<line x1="${(handRx - Math.cos(aimAngle) * 1.2).toFixed(2)}" y1="${(handRy - Math.sin(aimAngle) * 1.2).toFixed(2)}" x2="${tipX.toFixed(2)}" y2="${tipY.toFixed(2)}" stroke="#fcfcfc" stroke-width="2.6" />` +
    `<circle cx="${tipX.toFixed(2)}" cy="${tipY.toFixed(2)}" r="1.4" fill="#ff9e64" />` +
    `</g>` +
    renderActor({
      hipX: screenX,
      hipY: walk.hipY,
      lean: 1.8,
      headTilt: -aimAngle * 1.4,
      footL: walk.footL,
      footR: walk.footR,
      handL: [screenX - 3.5 - walk.swing * 4.2, walk.hipY - 3],
      handR: [handRx, handRy],
      alpha: introFade,
    }) +
    `<rect x="0" y="0" width="240" height="104" fill="url(#${edgeId})" pointer-events="none" />`
  );
}

// ---- Card 1: Film Reel & Cinema Projector ----

function renderReel(
  cx: number,
  cy: number,
  r: number,
  deg: number,
  accentHub: boolean,
): string {
  return (
    `<g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${deg.toFixed(1)})">` +
    `<circle cx="0" cy="0" r="${r}" stroke="#fcfcfc" stroke-width="1.5" fill="#000000" />` +
    `<line x1="0" y1="${-r + 1.5}" x2="0" y2="${r - 1.5}" stroke="#8e8e8e" stroke-width="1.1" />` +
    `<line x1="${-r + 1.5}" y1="0" x2="${r - 1.5}" y2="0" stroke="#8e8e8e" stroke-width="1.1" />` +
    `<circle cx="0" cy="0" r="2.1" fill="${accentHub ? "#ff9e64" : "#fcfcfc"}" />` +
    `</g>`
  );
}

function drawCardProjector(timeSec: number, idPrefix: string): string {
  const dur = 3.2;
  const t = (timeSec % dur) / dur;
  const fade = cycleFade(timeSec, t);

  const wP = smooth(sub(t, 0.02, 0.36));
  const stepBack = smooth(sub(t, 0.54, 0.66)) * 5;
  const x = lerp(42, 102, wP) - stepBack;
  const isWalking = t < 0.36;
  const walk = isWalking
    ? walkFeetAndBob(x, sub(t, 0.02, 0.36) * 2.1, 6.0, 2.8, 86)
    : {
        footL: [x - 2.6, 86] as Point,
        footR: [x + 2.8, 86] as Point,
        hipY: 68.2,
        swing: 0,
      };

  const mountP = smooth(sub(t, 0.36, 0.5));
  const mounted = t >= 0.5;
  const relaxP = smooth(sub(t, 0.52, 0.66));

  const carryX = x + 9.0;
  const carryY = walk.hipY - 7.5;
  const spindleX = 121;
  const spindleY = 41;

  const reelX = mounted ? spindleX : lerp(carryX, spindleX, mountP);
  const reelY = mounted
    ? spindleY
    : lerp(carryY, spindleY, mountP) - Math.sin(mountP * Math.PI) * 2.5;
  const spinAngle = mounted ? (t - 0.5) * 560 : wP * 140;

  const beamOn = mounted ? smooth(sub(t, 0.51, 0.58)) * fade : 0;
  const flicker = 0.86 + 0.14 * Math.sin(timeSec * 26);

  const handTargetL: Point = [reelX - 5.2, reelY + 3.2];
  const handTargetR: Point = [reelX - 3.2, reelY + 4.8];
  const restL: Point = [x - 3.5, walk.hipY - 2.5];
  const restR: Point = [x + 3.0, walk.hipY - 3.0];

  const handL: Point = mounted
    ? [
        lerp(handTargetL[0], restL[0], relaxP),
        lerp(handTargetL[1], restL[1], relaxP),
      ]
    : handTargetL;
  const handR: Point = mounted
    ? [
        lerp(handTargetR[0], restR[0], relaxP),
        lerp(handTargetR[1], restR[1], relaxP),
      ]
    : handTargetR;

  const stretchLift = !mounted ? Math.sin(mountP * Math.PI) * 1.8 : 0;
  const lean = mounted ? lerp(2.6, 0.6, relaxP) : lerp(1.8, 2.8, mountP);
  const beamId = `${idPrefix}-projBeam`;

  return (
    `<g transform="translate(20 2)">` +
    `<defs>` +
    `<linearGradient id="${beamId}" x1="131" y1="53" x2="176" y2="53" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0%" stop-color="#ff9e64" stop-opacity="${(0.42 * beamOn * flicker).toFixed(3)}" />` +
    `<stop offset="100%" stop-color="#ff9e64" stop-opacity="${(0.08 * beamOn).toFixed(3)}" />` +
    `</linearGradient>` +
    `</defs>` +
    `<line x1="24" y1="86" x2="180" y2="86" stroke="#212121" stroke-width="1.2" stroke-linecap="round" />` +
    (beamOn > 0.01
      ? `<polygon points="132,51 162,36 162,68 132,55" fill="url(#${beamId})" />`
      : "") +
    `<g opacity="${lerp(0.28, 1, beamOn).toFixed(3)}">` +
    `<rect x="162" y="34" width="20" height="36" rx="2.5" stroke="${beamOn > 0.3 ? "#ff9e64" : "#3a3a3a"}" stroke-width="1.5" fill="#050505" />` +
    (beamOn > 0.25
      ? `<rect x="165.5" y="38" width="13" height="17" rx="1" stroke="#fcfcfc" stroke-width="1.2" opacity="${beamOn.toFixed(2)}" />` +
        `<line x1="165.5" y1="59" x2="176" y2="59" stroke="#ff9e64" stroke-width="1.3" stroke-linecap="round" opacity="${beamOn.toFixed(2)}" />` +
        `<line x1="165.5" y1="63" x2="173" y2="63" stroke="#8e8e8e" stroke-width="1.2" stroke-linecap="round" opacity="${beamOn.toFixed(2)}" />`
      : "") +
    `</g>` +
    `<g stroke-linecap="round" stroke-linejoin="round">` +
    `<line x1="116" y1="61" x2="107" y2="86" stroke="#8e8e8e" stroke-width="1.4" />` +
    `<line x1="116" y1="61" x2="116" y2="86" stroke="#8e8e8e" stroke-width="1.4" />` +
    `<line x1="116" y1="61" x2="125" y2="86" stroke="#8e8e8e" stroke-width="1.4" />` +
    `<line x1="112" y1="48" x2="107" y2="41" stroke="#8e8e8e" stroke-width="1.4" />` +
    `<line x1="119" y1="48" x2="121" y2="41" stroke="#8e8e8e" stroke-width="1.4" />` +
    renderReel(107, 41, 6.8, mounted ? (t - 0.5) * 560 : 0, false) +
    `<rect x="108" y="48" width="18" height="12.5" rx="2.2" fill="#000000" stroke="#fcfcfc" stroke-width="1.55" />` +
    `<polygon points="126,51 132,49 132,57 126,55" fill="#000000" stroke="#fcfcfc" stroke-width="1.45" />` +
    `</g>` +
    `<g opacity="${fade.toFixed(3)}">${renderReel(reelX, reelY, 7.6, spinAngle, true)}</g>` +
    renderActor({
      hipX: x,
      hipY: walk.hipY - stretchLift,
      lean,
      headTilt: mounted ? 0.4 : 0.7,
      footL: walk.footL,
      footR: walk.footR,
      handL,
      handR,
      alpha: fade,
    }) +
    `</g>`
  );
}

// ---- Card 2: Game Cartridge into Console Slot ----

function drawCardCartridge(timeSec: number): string {
  const dur = 3.0;
  const t = (timeSec % dur) / dur;
  const fade = cycleFade(timeSec, t);

  const wP = smooth(sub(t, 0.02, 0.34));
  const x = lerp(44, 103, wP);
  const isWalking = t < 0.34;
  const walk = isWalking
    ? walkFeetAndBob(x, sub(t, 0.02, 0.34) * 2.0, 6.0, 3.0, 86)
    : {
        footL: [100, 86] as Point,
        footR: [105.5, 86] as Point,
        hipY: 68.2,
        swing: 0,
      };

  const liftP = smooth(sub(t, 0.34, 0.47));
  const slamP = smooth(sub(t, 0.47, 0.55));
  const plugged = t >= 0.55;
  const releaseP = smooth(sub(t, 0.57, 0.7));

  const hop =
    t >= 0.62 && t < 0.76 ? Math.sin(sub(t, 0.62, 0.76) * Math.PI) * 3.2 : 0;
  const squat =
    !plugged && t >= 0.47
      ? Math.sin(slamP * Math.PI) * 2.5
      : plugged && t < 0.61
        ? (1 - sub(t, 0.55, 0.61)) * 2.5
        : 0;

  const cartX = plugged ? 118 : lerp(x + 7, 118, liftP);
  const cartY = plugged
    ? 72
    : t < 0.47
      ? lerp(walk.hipY - 15, 57, liftP)
      : lerp(57, 72, slamP);

  const screenOn = plugged ? smooth(sub(t, 0.55, 0.63)) * fade : 0;
  const sparkAlpha =
    t >= 0.53 && t < 0.66 ? (1 - sub(t, 0.53, 0.66)) * fade : 0;

  const holdL: Point = [cartX - 4.8, cartY - 2];
  const holdR: Point = [cartX - 2.2, cartY - 1];
  const restL: Point = [x - 4, walk.hipY - 3 - hop];
  const restR: Point = [x + 4, walk.hipY - 4 - hop * 1.4];

  const handL: Point = plugged
    ? [
        lerp(holdL[0], restL[0], releaseP),
        lerp(holdL[1], restL[1], releaseP),
      ]
    : holdL;
  const handR: Point = plugged
    ? [
        lerp(holdR[0], restR[0], releaseP),
        lerp(holdR[1], restR[1], releaseP),
      ]
    : holdR;

  return (
    `<g transform="translate(20 2)">` +
    `<line x1="24" y1="86" x2="180" y2="86" stroke="#212121" stroke-width="1.2" stroke-linecap="round" />` +
    `<path d="M 128 82 C 138 82 143 85 153 78" stroke="${screenOn > 0.3 ? "#ff9e64" : "#3a3a3a"}" stroke-width="1.3" stroke-linecap="round" />` +
    `<g opacity="${lerp(0.3, 1, screenOn).toFixed(3)}">` +
    `<rect x="152" y="42" width="23" height="34" rx="2.5" fill="#050505" stroke="${screenOn > 0.3 ? "#fcfcfc" : "#3a3a3a"}" stroke-width="1.5" />` +
    `<line x1="163.5" y1="76" x2="163.5" y2="86" stroke="#8e8e8e" stroke-width="1.4" />` +
    `<line x1="158" y1="86" x2="169" y2="86" stroke="#8e8e8e" stroke-width="1.4" stroke-linecap="round" />` +
    (screenOn > 0.2
      ? `<polygon points="163.5,51 167.5,57 163.5,63 159.5,57" fill="rgba(255,158,100,0.22)" stroke="#ff9e64" stroke-width="1.4" stroke-linejoin="round" />` +
        `<line x1="157" y1="69" x2="170" y2="69" stroke="#8e8e8e" stroke-width="1.2" stroke-linecap="round" />`
      : "") +
    `</g>` +
    `<g opacity="${fade.toFixed(3)}">` +
    `<rect x="${(cartX - 5.5).toFixed(2)}" y="${(cartY - 7).toFixed(2)}" width="11" height="13" rx="1.6" fill="#000000" stroke="#fcfcfc" stroke-width="1.5" />` +
    `<line x1="${(cartX - 3).toFixed(2)}" y1="${(cartY - 3.5).toFixed(2)}" x2="${(cartX + 3).toFixed(2)}" y2="${(cartY - 3.5).toFixed(2)}" stroke="#ff9e64" stroke-width="1.6" stroke-linecap="round" />` +
    `</g>` +
    `<rect x="108" y="77" width="20" height="9" rx="2" fill="#000000" stroke="#fcfcfc" stroke-width="1.55" />` +
    `<circle cx="124" cy="81.5" r="1.4" fill="${plugged ? "#ff9e64" : "#3a3a3a"}" />` +
    (sparkAlpha > 0.02
      ? `<g opacity="${sparkAlpha.toFixed(3)}" stroke="#ff9e64" stroke-width="1.4" stroke-linecap="round">` +
        `<line x1="108" y1="73" x2="104" y2="69" />` +
        `<line x1="128" y1="73" x2="132" y2="69" />` +
        `<line x1="118" y1="63" x2="118" y2="58" />` +
        `</g>`
      : "") +
    renderActor({
      hipX: x,
      hipY: walk.hipY + squat - hop,
      lean: plugged ? lerp(2.4, 0.5, releaseP) : lerp(1.2, 2.5, liftP),
      headTilt: plugged ? 0.5 : 0.6,
      footL: [walk.footL[0], walk.footL[1] - hop],
      footR: [walk.footR[0], walk.footR[1] - hop],
      handL,
      handR,
      alpha: fade,
    }) +
    `</g>`
  );
}

// ---- Card 3: Library Ladder & Top-Shelf Glowing Case ----

const LADDER_RUNGS_Y: readonly number[] = [76, 64, 52, 40, 29];
const ladX = (y: number): number => 100 + ((86 - y) / (86 - 26)) * 18;

function drawCardLadder(timeSec: number): string {
  const dur = 3.5;
  const t = (timeSec % dur) / dur;
  const fade = cycleFade(timeSec, t);

  let hipX: number;
  let hipY: number;
  let footL: Point;
  let footR: Point;
  let handL: Point;
  let handR: Point;
  let lean = 1.8;
  let headTilt = 0.7;

  if (t < 0.25) {
    const wP = smooth(sub(t, 0.02, 0.25));
    hipX = lerp(50, 95, wP);
    const w = walkFeetAndBob(hipX, wP * 1.6, 5.8, 2.8, 86);
    hipY = w.hipY;
    footL = w.footL;
    footR = w.footR;
    handL = [hipX - 3.5 - w.swing * 4, hipY - 3];
    handR = [hipX + 4 + w.swing * 4, hipY - 3.5];
  } else if (t < 0.56) {
    const cP = sub(t, 0.25, 0.56);
    const stepFloat = cP * 3;
    const stepIdx = Math.floor(Math.min(2.999, stepFloat));
    const f = smooth(stepFloat - stepIdx);

    const yLevels = [86, 76, 64, 52] as const;
    const curStart = yLevels[stepIdx] ?? 86;
    const curEnd = yLevels[stepIdx + 1] ?? 52;
    const curFootY = lerp(curStart, curEnd, f);
    const otherFootY =
      stepIdx === 0
        ? lerp(86, 76, smooth(clamp((stepFloat - 0.35) / 0.65, 0, 1)))
        : curStart;

    const even = stepIdx % 2 === 0;
    const fLy = even ? otherFootY : curFootY;
    const fRy = even ? curFootY : otherFootY;
    const liftL = !even ? Math.sin(f * Math.PI) * 2.0 : 0;
    const liftR = even ? Math.sin(f * Math.PI) * 2.0 : 0;

    footL = [ladX(fLy) - 0.8, fLy - liftL];
    footR = [ladX(fRy) - 0.2, fRy - liftR];

    const avgFootY = (fLy + fRy) * 0.5;
    hipY = avgFootY - 16.5;
    hipX = ladX(avgFootY) - 5.2;

    const hLy = avgFootY - 21;
    const hRy = curFootY - 22;
    handL = [ladX(hLy), hLy];
    handR = [ladX(hRy), hRy];
    lean = 2.6;
    headTilt = 0.85;
  } else {
    const reachP = smooth(sub(t, 0.56, 0.68));
    const liftP = smooth(sub(t, 0.69, 0.8));
    const tiptoe = Math.sin(reachP * Math.PI * 0.5) * 1.8;

    footL = [ladX(64) - 0.6, 64];
    footR = [ladX(52) - 0.2, 52];
    hipY = 52 - 16.0 - tiptoe;
    hipX = ladX(52) - 4.4 + reachP * 1.2 - liftP * 0.6;

    handL = [ladX(38), 38];
    const shelfTarget: Point = [123.0, 27.5];
    const proudTarget: Point = [118.0, 21.5];
    const startHand: Point = [ladX(31), 31];

    handR =
      t < 0.69
        ? [
            lerp(startHand[0], shelfTarget[0], reachP),
            lerp(startHand[1], shelfTarget[1], reachP),
          ]
        : [
            lerp(shelfTarget[0], proudTarget[0], liftP),
            lerp(shelfTarget[1], proudTarget[1], liftP),
          ];

    lean = lerp(2.8, 1.8, liftP);
    headTilt = lerp(0.85, 0.45, liftP);
  }

  const plucked = t >= 0.67;
  const liftCardP = smooth(sub(t, 0.68, 0.8));
  const boxX = plucked ? lerp(124.2, handR[0] + 2.0, liftCardP) : 124.2;
  const boxY = plucked ? lerp(27.5, handR[1] - 4.0, liftCardP) : 27.5;
  const boxRot = plucked ? lerp(0, -10, liftCardP) : 0;
  const halo = plucked ? smooth(sub(t, 0.72, 0.84)) * fade : 0;

  let rungsSvg = "";
  for (const ry of LADDER_RUNGS_Y) {
    const rx = ladX(ry);
    rungsSvg += `<line x1="${rx.toFixed(1)}" y1="${ry}" x2="${(rx + 4.5).toFixed(1)}" y2="${ry}" stroke-width="1.35" />`;
  }

  return (
    `<g transform="translate(20 2)">` +
    `<line x1="24" y1="86" x2="180" y2="86" stroke="#212121" stroke-width="1.2" stroke-linecap="round" />` +
    `<g stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="118" y="16" width="46" height="70" rx="2" stroke="#525252" stroke-width="1.45" fill="none" />` +
    `<line x1="118" y1="36" x2="164" y2="36" stroke="#525252" stroke-width="1.35" />` +
    `<line x1="118" y1="60" x2="164" y2="60" stroke="#525252" stroke-width="1.35" />` +
    `<line x1="133" y1="22" x2="133" y2="35" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="140" y1="21" x2="140" y2="35" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="147" y1="24" x2="147" y2="35" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="155" y1="20" x2="155" y2="35" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="125" y1="43" x2="125" y2="59" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="131" y1="41" x2="131" y2="59" stroke="#525252" stroke-width="1.4" />` +
    `<line x1="138" y1="44" x2="138" y2="59" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="149" y1="42" x2="149" y2="59" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="156" y1="45" x2="156" y2="59" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="126" y1="67" x2="126" y2="85" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="134" y1="65" x2="134" y2="85" stroke="#424242" stroke-width="1.4" />` +
    `<line x1="145" y1="68" x2="145" y2="85" stroke="#525252" stroke-width="1.4" />` +
    `<line x1="153" y1="66" x2="153" y2="85" stroke="#424242" stroke-width="1.4" />` +
    `</g>` +
    `<g stroke="#8e8e8e" stroke-linecap="round">` +
    `<line x1="100" y1="86" x2="118" y2="26" stroke-width="1.5" />` +
    `<line x1="104.5" y1="86" x2="122.5" y2="26" stroke-width="1.3" opacity="0.65" />` +
    rungsSvg +
    `</g>` +
    `<g transform="translate(${boxX.toFixed(2)} ${boxY.toFixed(2)}) rotate(${boxRot.toFixed(1)})" opacity="${fade.toFixed(3)}">` +
    (halo > 0.02
      ? `<circle cx="0" cy="0" r="${(9 + halo * 4).toFixed(1)}" fill="rgba(255,158,100,${(0.16 * halo).toFixed(3)})" />`
      : "") +
    `<rect x="-3.2" y="-6.8" width="6.4" height="13.6" rx="1.3" fill="rgba(255,158,100,0.2)" stroke="#ff9e64" stroke-width="1.6" />` +
    `</g>` +
    renderActor({
      hipX,
      hipY,
      lean,
      headTilt,
      footL,
      footR,
      handL,
      handR,
      alpha: fade,
    }) +
    `</g>`
  );
}

export function renderLoadingSceneSvg(
  scene: LoadingSceneId,
  timeSec: number,
  idPrefix = "lm",
): string {
  const safeTime = Number.isFinite(timeSec) && timeSec >= 0 ? timeSec : 0;
  switch (scene) {
    case "auth-room":
      return drawAuthRoom(safeTime, idPrefix);
    case "auth-corridor":
      return drawAuthCorridor(safeTime, idPrefix);
    case "card-projector":
      return drawCardProjector(safeTime, idPrefix);
    case "card-cartridge":
      return drawCardCartridge(safeTime);
    case "card-ladder":
      return drawCardLadder(safeTime);
  }
}
