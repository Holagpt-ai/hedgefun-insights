/**
 * Rasterize public/brand/stocksist-icon-master.png into favicon / PWA assets.
 * Run: node scripts/generate-favicon-assets.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const masterPath = "public/brand/stocksist-icon-master.png";
const master = readFileSync(masterPath);

function resizeSquare(size) {
  return sharp(master).resize(size, size, {
    fit: "contain",
    position: "centre",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png();
}

const pngTargets = [
  { path: "public/favicon-16x16.png", size: 16 },
  { path: "public/favicon-32x32.png", size: 32 },
  { path: "public/apple-touch-icon.png", size: 180 },
  { path: "public/android-chrome-192x192.png", size: 192 },
  { path: "public/android-chrome-512x512.png", size: 512 },
];

for (const { path, size } of pngTargets) {
  await resizeSquare(size).toFile(path);
  console.log(`Wrote ${path}`);
}

const icon16 = await resizeSquare(16).toBuffer();
const icon32 = await resizeSquare(32).toBuffer();
const ico = await pngToIco([icon16, icon32]);
writeFileSync("public/favicon.ico", ico);
console.log("Wrote public/favicon.ico");
