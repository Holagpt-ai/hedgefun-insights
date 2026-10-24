import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMcpArtifacts } from "./lib/artifacts.mjs";
import { extractJournalTargets, extractLiteralTargets } from "./lib/navigation.mjs";
import { compareAssetManifests, inspectGitDivergence, missingPackageScripts } from "./lib/repo-meta.mjs";
import { extractRoutePatterns, isKnownRoute } from "./lib/routes.mjs";
import {
  extractConstArray,
  extractSitemapMainPaths,
  findForbiddenBrandHits,
  symmetricDifference,
} from "./lib/sitemap-brand.mjs";
import { runIntegrity } from "./run.mjs";

const APP = `
<RouteChangeTracker />
<Routes>
  <Route element={<PublicLayout />}>
    <Route path="/" element={<Index />} />
    <Route path="/stocks/:ticker" element={<StockDetail />} />
    <Route path="/etf/screener" element={<Navigate to="/etfs/screener" replace />} />
  </Route>
  <Route element={<DashboardLayout />}>
    <Route path="/dashboard/journal" element={<JournalShell />}>
      <Route index element={<OverviewPage />} />
      <Route path="trades/new" element={<NewTradePage />} />
      <Route path="trades/:tradeId" element={<TradeDetailPage />} />
    </Route>
    <Route path={AI_TRADER_DASHBOARD_PATH} element={<AiTraderPage />} />
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
`;

test("extracts nested routes and resolves path constants", () => {
  const { patterns, unresolved } = extractRoutePatterns(APP, {
    AI_TRADER_DASHBOARD_PATH: "/dashboard/ai-trader",
  });
  assert.deepEqual(unresolved, []);
  assert.equal(isKnownRoute(patterns, "/stocks/AAPL"), true);
  assert.equal(isKnownRoute(patterns, "/stocks/AAPL/extra"), false);
  assert.equal(isKnownRoute(patterns, "/dashboard/journal/trades/new"), true);
  assert.equal(isKnownRoute(patterns, "/dashboard/journal/trades/:tradeId"), true);
  assert.equal(isKnownRoute(patterns, "/dashboard/ai-trader"), true);
  assert.equal(isKnownRoute(patterns, "/missing"), false);
  assert.equal(patterns.includes("*"), false);
});

test("reads navigation literals and journal templates", () => {
  assert.deepEqual(extractLiteralTargets(`route: "/dashboard/ai"\nto: "/pro"\nnavigate("/login")`), [
    "/dashboard/ai",
    "/pro",
    "/login",
  ]);
  const journal = `
    export const JOURNAL_BASE = "/dashboard/journal";
    path: JOURNAL_BASE,
    path: \`\${JOURNAL_BASE}/trades/new\`,
    path: \`\${JOURNAL_BASE}/settings?section=ai-memory\`,
  `;
  assert.deepEqual(extractJournalTargets(journal), [
    "/dashboard/journal",
    "/dashboard/journal/trades/new",
    "/dashboard/journal/settings",
  ]);
});

test("compares sitemap lists and flags forbidden public hosts", () => {
  const edge = extractSitemapMainPaths(`{ path: "/", pri: "1" }, { path: "/news", pri: "0.8" }`);
  const app = extractConstArray(`export const STATIC_SITEMAP_PATHS = [\n  "/",\n  "/about",\n] as const;`, "STATIC_SITEMAP_PATHS");
  assert.deepEqual(symmetricDifference(edge, app).onlyRight, ["/about"]);
  assert.deepEqual(findForbiddenBrandHits("README.md", "https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID"), [
    "REPLACE_WITH_PROJECT_ID",
  ]);
  assert.deepEqual(findForbiddenBrandHits("src/pages/Index.tsx", "https://hedgefun.com"), ["hedgefun.com"]);
});

test("checks MCP agreement, git divergence, and deploy hashes", () => {
  const broken = inspectMcpArtifacts({
    packageJson: { dependencies: { "@lovable.dev/mcp-js": "0.0.1" } },
    compatSource: `export const VERIFIED_MCP_JS_VERSION = "0.20.0";`,
    manifest: { sdk_version: "0.20.0", mcp: { server: { title: "Other" }, tools: [] } },
    bundleSource: "manual",
  });
  assert.ok(broken.problems.length >= 3);

  const diverged = inspectGitDivergence((command) => {
    if (command.includes("--count") && command.includes("origin/main..HEAD")) return "2\n";
    if (command.includes("--count") && command.includes("HEAD..origin/main")) return "4\n";
    if (command.includes("--abbrev-ref")) return "topic\n";
    if (command === "git rev-parse HEAD") return "aaa\n";
    if (command === "git rev-parse origin/main") return "bbb\n";
    throw new Error(command);
  });
  assert.equal(diverged.behind, 4);
  assert.equal(diverged.ahead, 2);
  assert.deepEqual(compareAssetManifests({ js: "/a.js", css: "/a.css" }, { js: "/b.js", css: "/a.css" }).status, "differ");
  assert.deepEqual(missingPackageScripts({ scripts: { dev: "vite" } }), ["build", "typecheck", "test", "integrity"]);
});

test("repository navigation, sitemap, brand, and MCP artifacts have no integrity errors", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const report = await runIntegrity(root, {
    exec: (command) => {
      if (command.includes("abbrev-ref")) return "test\n";
      if (command.includes("rev-parse HEAD")) return "abc\n";
      if (command.includes("origin/main")) return "abc\n";
      if (command.includes("--count")) return "0\n";
      throw new Error(command);
    },
  });
  const errors = report.findings.filter((finding) => finding.severity === "error");
  assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
  assert.ok(report.routeCount > 40);
});
