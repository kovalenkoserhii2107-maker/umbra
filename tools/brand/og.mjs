// Replaces the old eclipse on the link previews with the new mark; writes the site's webp mark.
// Usage: node tools/brand/og.mjs public <out dir>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const [pub, out] = process.argv.slice(2);
const src = readFileSync(new URL("./corona.mjs", import.meta.url), "utf8");
// The drawing code of corona.mjs: everything inside its page.evaluate up to `const png`.
const body = src.slice(src.indexOf("  /** Gaussian fall-off"), src.indexOf("  function banner("));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
const images = {};
for (const name of ["og-image", "og-invite"])
  images[name] = `data:image/png;base64,${readFileSync(`${pub}/${name}.png`).toString("base64")}`;
const brandPng = `data:image/png;base64,${readFileSync(`${out}/brand_288.png`).toString("base64")}`;

const result = await page.evaluate(
  async ({ body, images, brandPng }) => {
    const mark = new Function(`${body}; return mark;`)();
    const res = {};
    for (const [name, url] of Object.entries(images)) {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      // Wipe the old eclipse: each row takes the backdrop colour of its left edge.
      // Each row: a blend from the backdrop at the left edge to the one just
      // before the text, so no seam is left where the old picture was.
      const left = g.getImageData(4, 0, 1, c.height).data;
      const right = g.getImageData(557, 0, 1, c.height).data;
      for (let y = 0; y < c.height; y++) {
        const row = g.createLinearGradient(0, 0, 557, 0);
        row.addColorStop(0, `rgb(${left[y * 4]},${left[y * 4 + 1]},${left[y * 4 + 2]})`);
        row.addColorStop(1, `rgb(${right[y * 4]},${right[y * 4 + 1]},${right[y * 4 + 2]})`);
        g.fillStyle = row;
        g.fillRect(0, y, 557, 1);
      }
      // The new mark, its glow fading out before the text on the right.
      const S = 1100;
      const [mx, my, mr] = [270, 320, 150];
      const m = mark(S, { bg: "none", moon: mr / S, cy: 0.5 });
      const mg = m.getContext("2d");
      mg.globalCompositeOperation = "destination-in";
      const fade = mg.createLinearGradient(S / 2 - mx + 330, 0, S / 2 - mx + 552, 0);
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        fade.addColorStop(t, `rgba(0,0,0,${(1 - t * t * (3 - 2 * t)).toFixed(3)})`);
      }
      mg.fillStyle = fade;
      mg.fillRect(0, 0, S, S);
      g.drawImage(m, mx - S / 2, my - S / 2);
      res[name] = c.toDataURL("image/png");
    }
    const b = new Image();
    b.src = brandPng;
    await b.decode();
    const bc = document.createElement("canvas");
    bc.width = b.width;
    bc.height = b.height;
    bc.getContext("2d").drawImage(b, 0, 0);
    res["brand-mark-webp"] = bc.toDataURL("image/webp", 0.92);
    return res;
  },
  { body, images, brandPng },
);
writeFileSync(`${out}/og-image.png`, Buffer.from(result["og-image"].split(",")[1], "base64"));
writeFileSync(`${out}/og-invite.png`, Buffer.from(result["og-invite"].split(",")[1], "base64"));
writeFileSync(`${out}/brand-mark.webp`, Buffer.from(result["brand-mark-webp"].split(",")[1], "base64"));
await browser.close();
console.log("done");
