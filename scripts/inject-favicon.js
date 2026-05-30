import { readFileSync, writeFileSync } from "fs";

const path = "dist/index.html";
let html = readFileSync(path, "utf8");

if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    `<link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon.ico">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#1d4ed8">`
  );
  writeFileSync(path, html);
  console.log("Favicon tags injected into dist/index.html");
}
