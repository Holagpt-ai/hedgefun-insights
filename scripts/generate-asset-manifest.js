import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("dist/index.html", "utf-8");

const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);

const manifest = {
  js: jsMatch ? jsMatch[1] : "/assets/index.js",
  css: cssMatch ? cssMatch[1] : "/assets/index.css",
};

writeFileSync("dist/asset-manifest.json", JSON.stringify(manifest));
console.log("Asset manifest written:", manifest);
