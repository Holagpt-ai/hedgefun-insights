import { readFileSync, writeFileSync } from "fs";

const path = "dist/index.html";
let html = readFileSync(path, "utf8");

if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#1d4ed8">`
  );
  writeFileSync(path, html);
  console.log("Favicon tags injected into dist/index.html");
}
