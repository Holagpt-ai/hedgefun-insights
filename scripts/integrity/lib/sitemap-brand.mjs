import { normalizePath } from "./routes.mjs";

export const CANONICAL_ORIGIN = "https://stocksist.com";

export const BRAND_FILES = [
  "README.md",
  "index.html",
  "seo-boundaries.ts",
  "src/config/brand.ts",
  "src/config/seo.ts",
  "supabase/functions/_shared/brand.ts",
];

export function extractQuotedPaths(body) {
  return [...body.matchAll(/["'](\/[^"']*)["']/g)].map((match) => normalizePath(match[1]));
}

export function extractConstArray(source, constName) {
  const start = source.indexOf(constName);
  if (start === -1) return [];
  const open = source.indexOf("[", start);
  if (open === -1) return [];
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) return extractQuotedPaths(source.slice(open, i));
    }
  }
  return [];
}

export function extractSitemapMainPaths(source) {
  return [...source.matchAll(/\bpath:\s*["'](\/[^"']*)["']/g)].map((match) => normalizePath(match[1]));
}

export function unique(values) {
  return [...new Set(values)];
}

export function symmetricDifference(left, right) {
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  return {
    onlyLeft: left.filter((value) => !rightSet.has(value)),
    onlyRight: right.filter((value) => !leftSet.has(value)),
  };
}

export function extractHttpOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function findCanonicalOrigins(sources) {
  const origins = [];
  const patterns = [
    /CANONICAL_SITE_ORIGIN\s*=\s*["'](https?:\/\/[^"']+)["']/,
    /\burl:\s*["'](https?:\/\/[^"']+)["']/,
    /rel="canonical"\s+href="(https?:\/\/[^"]+)"/,
  ];
  for (const [file, source] of Object.entries(sources)) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      origins.push({ file, value: match[1], origin: extractHttpOrigin(match[1]) });
    }
  }
  return origins;
}

export function findForbiddenBrandHits(file, source) {
  const hits = [];
  if (source.includes("REPLACE_WITH_PROJECT_ID")) hits.push("REPLACE_WITH_PROJECT_ID");
  if (/hedgefun\.com/i.test(source)) hits.push("hedgefun.com");
  if (/hedgefun\.fun/i.test(source)) hits.push("hedgefun.fun");
  if (file !== "src/integrations/supabase/previewAuthStorage.ts" && /lovable\.app/i.test(source)) {
    hits.push("lovable.app");
  }
  return hits;
}

export function vercelDestinationOrigins(vercel) {
  const redirects = Array.isArray(vercel?.redirects) ? vercel.redirects : [];
  return redirects.map((redirect) => ({
    source: redirect.source,
    destination: redirect.destination,
    origin: extractHttpOrigin(redirect.destination),
  }));
}
