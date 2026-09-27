/**
 * Generate social preview assets from public/brand/stocksist-icon-master.png.
 * Run: node scripts/generate-social-assets.mjs
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const masterPath = "public/brand/stocksist-icon-master.png";
const outPath = "public/og-share-card.png";

const ICON_SIZE = 220;
const ICON_LEFT = 88;
const ICON_TOP = Math.floor((HEIGHT - ICON_SIZE) / 2);

const layoutSvg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f8fafc"/>
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="#2563eb"/>
  <text x="360" y="290" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="68" font-weight="700" fill="#0f172a">Stocksist</text>
  <text x="360" y="352" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="26" font-weight="400" fill="#475569">Stock Market Intelligence for Active Investors and Traders</text>
  <text x="360" y="572" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="20" fill="#64748b">stocksist.com</text>
</svg>`;

const master = readFileSync(masterPath);
const iconPng = await sharp(master)
  .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp(Buffer.from(layoutSvg))
  .composite([{ input: iconPng, left: ICON_LEFT, top: ICON_TOP }])
  .png({ compressionLevel: 9 })
  .toFile(outPath);

const meta = await sharp(outPath).metadata();
console.log(`Wrote ${outPath} (${meta.width}x${meta.height})`);
