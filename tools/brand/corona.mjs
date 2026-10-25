// Umbra mark, «diamond ring» style: a black moon, white-gold light breaking
// over its upper edge, a soft halo fading into a dark backdrop. Drawn on a
// canvas in Chromium; writes icons, adaptive layers, TV banners, site icons.
// Usage: node tools/brand/corona.mjs <out dir>   (then og.mjs, then copy — see README)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body style='margin:0'></body></html>");

const files = await page.evaluate(() => {
  window.__mark = (...a) => mark(...a);
  /**
   * Draws the mark into a size×size canvas. moon — the moon's radius as a
   * share of the size; bg — dark backdrop (square, round) or none.
   */
  /** Gaussian fall-off in many steps: light without any visible edge. */
  function soft(gradient, rgb, peak, spread = 0.42) {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = peak * Math.exp(-((t / spread) ** 2) / 2) * (1 - t ** 6);
      gradient.addColorStop(t, `rgba(${rgb}, ${a.toFixed(4)})`);
    }
    return gradient;
  }

  function mark(size, { moon = 0.29, bg = "square", cy = 0.53 } = {}) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    const x = size / 2;
    const y = size * cy;
    const r = size * moon;
    const top = y - r; // where the light breaks through

    if (bg !== "none") {
      const back = g.createLinearGradient(0, 0, 0, size);
      back.addColorStop(0, "#232220");
      back.addColorStop(0.55, "#0b0b0a");
      back.addColorStop(1, "#030303");
      g.fillStyle = back;
      if (bg === "round") {
        g.beginPath();
        g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.clip();
      } else g.fillRect(0, 0, size, size);
    }
    g.globalCompositeOperation = "lighter";

    // The whole corona: a faint warm ring all around the moon.
    const ring = soft(g.createRadialGradient(x, y, r * 0.97, x, y, r * 1.7), "255, 186, 84", 0.42, 0.3);
    g.fillStyle = ring;
    g.fillRect(0, 0, size, size);

    // The big glow, strongest above the moon.
    const halo = soft(g.createRadialGradient(x, top + r * 0.4, 0, x, top + r * 0.4, r * 2.1), "236, 168, 60", 0.75, 0.38);
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    const glow = soft(g.createRadialGradient(x, top + r * 0.15, 0, x, top + r * 0.15, r * 1.1), "255, 226, 150", 0.85, 0.4);
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    // The bead of sunlight on the edge: white-hot, wide and flat.
    g.save();
    g.translate(x, top + r * 0.04);
    g.scale(2, 1);
    g.fillStyle = soft(g.createRadialGradient(0, 0, 0, 0, 0, r * 0.42), "255, 250, 232", 1, 0.32);
    g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();

    // The moon, and the light scattered over its upper limb.
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#020202";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.clip();
    const limb = soft(g.createRadialGradient(x, top - r * 0.1, 0, x, top - r * 0.1, r * 0.8), "190, 118, 36", 0.7, 0.36);
    g.fillStyle = limb;
    g.fillRect(0, 0, size, size);
    g.restore();
    if (bg === "round") g.restore();
    return c;
  }

  function banner(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const back = g.createLinearGradient(0, 0, 0, h);
    back.addColorStop(0, "#232220");
    back.addColorStop(0.55, "#0b0b0a");
    back.addColorStop(1, "#030303");
    g.fillStyle = back;
    g.fillRect(0, 0, w, h);
    // The mark on a canvas wider than the banner is tall: its glow fades out
    // inside the canvas instead of ending at a straight edge.
    const k = 2;
    const m = mark(h * k, { bg: "none", moon: 0.3 / k, cy: 0.5 + 0.06 / k });
    const mx = w * 0.05 + h / 2;
    g.drawImage(m, mx - (h * k) / 2, h / 2 - (h * k) / 2);
    g.fillStyle = "#f5f2ee";
    const fs = Math.round(h * 0.13);
    g.font = `600 ${fs}px "Helvetica Neue", Arial, sans-serif`;
    g.textBaseline = "middle";
    let tx = w * 0.05 + h * 0.98;
    for (const ch of "UMBRA") {
      g.fillText(ch, tx, h * 0.53);
      tx += g.measureText(ch).width + fs * 0.3;
    }
    return c;
  }

  const png = (canvas) => canvas.toDataURL("image/png");
  /** Drawn large and scaled down: smooth gradients even at 48 px. */
  function small(size, opts) {
    const big = mark(1024, opts);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(big, 0, 0, size, size);
    return c;
  }

  return {
    ...Object.fromEntries([96, 144, 192].map((s) => [`ic_launcher_${s}`, png(small(s, { bg: "round" }))])),
    // Adaptive icon: background layer = the backdrop, foreground = the mark in the safe zone.
    ...Object.fromEntries([216, 324, 432].map((s) => [`fg_${s}`, png(small(s, { bg: "none", moon: 0.2, cy: 0.52 }))])),
    ...Object.fromEntries([216, 324, 432].map((s) => [`bgl_${s}`, png(small(s, { bg: "square", moon: 0 }))])),
    banner_640: png(banner(640, 360)),
    banner_960: png(banner(960, 540)),
    brand_288: png(small(288, { bg: "none", moon: 0.3 })),
    icon_512: png(small(512, {})),
    icon_192: png(small(192, {})),
    apple_180: png(small(180, {})),
    favicon_32: png(small(32, { moon: 0.33 })),
    maskable_512: png(small(512, { moon: 0.22, cy: 0.52 })),
  };
});
for (const [name, url] of Object.entries(files))
  writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(",")[1], "base64"));

writeFileSync(
  `${out}/preview.html`,
  `<html><body style="margin:0;background:#24242e;font-family:Arial;color:#ddd">
<div style="padding:30px;display:flex;flex-wrap:wrap;gap:30px;align-items:center;width:1040px">
  <div style="text-align:center"><img src="ic_launcher_192.png" style="width:192px;height:192px;border-radius:50%;box-shadow:0 0 0 6px #777"/><div>Umbra</div></div>
  <img src="ic_launcher_192.png" style="width:72px"/>
  <img src="ic_launcher_96.png" style="width:48px"/>
  <img src="icon_192.png" style="width:120px;border-radius:26px"/>
  <div style="background:#0b0b0b;padding:10px 16px;border-radius:12px;display:flex;align-items:center;gap:8px"><img src="brand_288.png" style="width:36px"/><span style="letter-spacing:.26em;font-weight:600;color:#f5f2ee">UMBRA</span></div>
  <img src="banner_640.png" style="width:640px;border-radius:14px"/>
</div></body></html>`,
);
await page.setViewportSize({ width: 1100, height: 640 });
await page.goto(`file://${out}/preview.html`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/preview.png` });
await browser.close();
console.log("done");
