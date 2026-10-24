/**
 * Textures of the night Earth for the waiting screen of «На вечер»: city
 * lights and clouds, drawn once on a canvas (no image to download) and kept
 * for the session.
 */

type Textures = { lights: string; clouds: string };

let cache: Promise<Textures> | null = null;

/** Repeatable pseudo-random numbers. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a grid that wraps horizontally (the strip loops). */
function noise(w: number, h: number, cell: number, rnd: () => number) {
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell) + 1;
  const grid = Array.from({ length: gw * gh }, rnd);
  const at = (x: number, y: number) => grid[(y % gh) * gw + (x % gw)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function draw(): Textures {
  const W = 640;
  const H = 120;
  const rnd = random(7);
  const n1 = noise(W, H, 40, rnd);
  const n2 = noise(W, H, 16, rnd);
  const n3 = noise(W, H, 6, rnd);

  // Clouds: layered noise, soft bands, faintly lit by the night sky.
  const clouds = document.createElement("canvas");
  clouds.width = W;
  clouds.height = H;
  const c = clouds.getContext("2d")!;
  const img = c.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = n1(x, y) * 0.55 + n2(x, y) * 0.3 + n3(x, y) * 0.15;
      const a = Math.max(0, (v - 0.48) * 3.2);
      const i = (y * W + x) * 4;
      img.data[i] = 150;
      img.data[i + 1] = 170;
      img.data[i + 2] = 205;
      img.data[i + 3] = Math.min(255, a * 150);
    }
  c.putImageData(img, 0, 0);

  // City lights: towns gathered around cities, warm sodium orange; drawn
  // at twice the size so the dots stay fine on the big screen.
  const lights = document.createElement("canvas");
  lights.width = W * 2;
  lights.height = H * 2;
  const l = lights.getContext("2d")!;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  for (let city = 0; city < 420; city++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const land = n1((cx * 0.7 + 300) % W, cy * 0.7);
    if (land < 0.42 || land > 0.72) continue;
    const size = 2 + rnd() * 9;
    const towns = 6 + Math.floor(rnd() * 40);
    for (let k = 0; k < towns; k++) {
      const x = ((cx + gauss() * size + W) % W) * 2;
      const y = (cy + gauss() * size * 0.6) * 2;
      const core = k < towns / 6;
      l.fillStyle = core ? "rgba(255,224,170,0.95)" : "rgba(255,170,90,0.6)";
      l.fillRect(x, y, core ? 1.6 : 1, core ? 1.6 : 1);
    }
  }
  return { lights: lights.toDataURL(), clouds: clouds.toDataURL() };
}

/** Drawn on first use, after the current frame, so the screen stays smooth. */
export function spaceTextures(): Promise<Textures> {
  if (!cache)
    cache = new Promise((resolve) =>
      window.setTimeout(() => resolve(draw()), 0),
    );
  return cache;
}
