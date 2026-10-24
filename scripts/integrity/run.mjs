import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectMcpArtifacts } from "./lib/artifacts.mjs";
import { NAV_FILES, extractNavigationTargets } from "./lib/navigation.mjs";
import {
  compareAssetManifests,
  inspectGitDivergence,
  missingPackageScripts,
} from "./lib/repo-meta.mjs";
import {
  extractExportedPathConstants,
  extractRoutePatterns,
  isKnownRoute,
} from "./lib/routes.mjs";
import {
  BRAND_FILES,
  CANONICAL_ORIGIN,
  extractSitemapMainPaths,
  extractConstArray,
  findCanonicalOrigins,
  findForbiddenBrandHits,
  symmetricDifference,
  unique,
  vercelDestinationOrigins,
} from "./lib/sitemap-brand.mjs";

const NOINDEX_PREFIXES = [
  "/dashboard",
  "/admin",
  "/account",
  "/auth",
  "/login",
  "/signup",
  "/register",
  "/sign-up",
  "/reset-password",
  "/unsubscribe",
  "/journal",
  "/watchlist",
  "/.lovable",
];

function read(root, file) {
  return readFileSync(join(root, file), "utf8");
}

function tryRead(root, file) {
  try {
    return read(root, file);
  } catch {
    return null;
  }
}

function isNoindex(pathname) {
  return NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isConcretePublicRoute(pattern) {
  if (!pattern.startsWith("/")) return false;
  if (pattern.includes(":") || pattern.includes("*")) return false;
  return !isNoindex(pattern);
}

export async function runIntegrity(root, options = {}) {
  const findings = [];
  const add = (severity, check, message) => findings.push({ severity, check, message });
  const packageJson = JSON.parse(read(root, "package.json"));
  const missingScripts = missingPackageScripts(packageJson);
  if (missingScripts.length > 0) {
    add("error", "build-health", `package.json is missing scripts: ${missingScripts.join(", ")}`);
  } else {
    add("info", "build-health", "typecheck and production build were not executed by this command");
  }

  const constantSources = [
    "src/lib/ai-trader/operating-mode.ts",
    "src/journal/nav.ts",
  ];
  const constants = {};
  for (const file of constantSources) {
    Object.assign(constants, extractExportedPathConstants(read(root, file)));
  }
  const appSource = read(root, "src/App.tsx");
  const { patterns, unresolved } = extractRoutePatterns(appSource, constants);
  if (unresolved.length > 0) {
    add("error", "routes", `unresolved route constants: ${unresolved.join(", ")}`);
  }
  if (patterns.length < 20) {
    add("error", "routes", `route extractor found only ${patterns.length} patterns`);
  }

  for (const file of NAV_FILES) {
    const targets = extractNavigationTargets(file, read(root, file));
    for (const target of targets) {
      if (!isKnownRoute(patterns, target)) {
        add("error", "navigation", `${file} links to ${target}, which is not a route`);
      }
    }
  }

  const edgePaths = unique(extractSitemapMainPaths(read(root, "supabase/functions/_shared/seo/sitemap-main-pages.ts")));
  const appPaths = unique(extractConstArray(read(root, "src/config/seo.ts"), "STATIC_SITEMAP_PATHS"));
  const diff = symmetricDifference(edgePaths, appPaths);
  if (diff.onlyLeft.length > 0 || diff.onlyRight.length > 0) {
    add(
      "error",
      "sitemap",
      `sitemap lists differ (edge only: ${diff.onlyLeft.join(", ") || "none"}; app only: ${diff.onlyRight.join(", ") || "none"})`,
    );
  }
  for (const sitemapPath of unique([...edgePaths, ...appPaths])) {
    if (!isKnownRoute(patterns, sitemapPath)) {
      add("error", "sitemap", `sitemap path ${sitemapPath} is not a route`);
    }
  }
  const sitemapSet = new Set(edgePaths);
  const omitted = patterns.filter((pattern) => isConcretePublicRoute(pattern) && !sitemapSet.has(pattern));
  if (omitted.length > 0) {
    add("info", "sitemap", `${omitted.length} public routes are absent from the main sitemap: ${omitted.join(", ")}`);
  }

  const originSources = {};
  for (const file of ["seo-boundaries.ts", "src/config/brand.ts", "supabase/functions/_shared/brand.ts", "index.html"]) {
    originSources[file] = read(root, file);
  }
  for (const found of findCanonicalOrigins(originSources)) {
    if (found.origin !== CANONICAL_ORIGIN) {
      add("error", "canonical", `${found.file} canonical origin is ${found.origin ?? found.value}`);
    }
  }

  for (const file of BRAND_FILES) {
    const hits = findForbiddenBrandHits(file, read(root, file));
    if (hits.length > 0) add("error", "brand", `${file} contains ${hits.join(", ")}`);
  }
  const vercel = JSON.parse(read(root, "vercel.json"));
  for (const redirect of vercelDestinationOrigins(vercel)) {
    if (redirect.origin !== CANONICAL_ORIGIN) {
      add("error", "brand", `vercel redirect ${redirect.source} destination is ${redirect.destination}`);
    }
  }

  const manifestText = tryRead(root, ".lovable/mcp/manifest.json");
  const bundle = tryRead(root, "supabase/functions/mcp/index.ts");
  const compat = tryRead(root, "scripts/mcp-js-compat.mjs");
  if (!manifestText || !bundle || !compat) {
    add("error", "artifacts", "MCP manifest, generated bundle, or version contract is missing");
  } else {
    const inspected = inspectMcpArtifacts({
      packageJson,
      compatSource: compat,
      manifest: JSON.parse(manifestText),
      bundleSource: bundle,
    });
    for (const problem of inspected.problems) add("error", "artifacts", problem);
    for (const note of inspected.notes) add("info", "artifacts", note);
  }

  const git = options.exec
    ? inspectGitDivergence(options.exec)
    : inspectGitDivergence((command) => execSync(command, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (!git.available) {
    add("warning", "git-divergence", `origin/main comparison unavailable (${git.reason})`);
  } else if (git.behind > 0) {
    add("warning", "git-divergence", `${git.branch} is ${git.behind} commit(s) behind origin/main and ${git.ahead} ahead`);
  } else if (git.ahead > 0) {
    add("info", "git-divergence", `${git.branch} is ${git.ahead} commit(s) ahead of origin/main ${git.main.slice(0, 12)}`);
  } else {
    add("info", "git-divergence", `${git.branch} matches origin/main ${git.main.slice(0, 12)}`);
  }

  let localManifest = null;
  const localManifestText = tryRead(root, "dist/asset-manifest.json");
  if (localManifestText) {
    try {
      localManifest = JSON.parse(localManifestText);
    } catch {
      add("warning", "deploy-sha", "dist/asset-manifest.json is not valid JSON");
    }
  }
  if (!options.remote) {
    add("info", "deploy-sha", "production asset manifest was not requested; deploy SHA was not compared");
  } else {
    try {
      const fetchImpl = options.fetch ?? globalThis.fetch;
      const response = await fetchImpl("https://stocksist.com/asset-manifest.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = await response.json();
      const compared = compareAssetManifests(localManifest, remote);
      if (!localManifest) {
        add("info", "deploy-sha", `production js ${remote.js}; no local dist manifest to compare`);
      } else if (compared.status === "match") {
        add("info", "deploy-sha", `local dist matches production asset ${remote.js}`);
      } else {
        add("warning", "deploy-sha", `local dist ${localManifest.js} differs from production ${remote.js}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      add("warning", "deploy-sha", `production asset manifest was not fetched (${reason})`);
    }
  }

  if (options.withTypecheck) {
    try {
      execSync("npm run typecheck", { cwd: root, stdio: "pipe" });
      add("info", "build-health", "typecheck passed");
    } catch (error) {
      add("error", "build-health", `typecheck failed (${error instanceof Error ? error.message : "npm run typecheck"})`);
    }
  }
  if (options.withBuild) {
    try {
      execSync("npm run build", { cwd: root, stdio: "pipe" });
      add("info", "build-health", "production build passed");
    } catch (error) {
      add("error", "build-health", `production build failed (${error instanceof Error ? error.message : "npm run build"})`);
    }
  }

  const summary = {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
  return { findings, summary, routeCount: patterns.length };
}
