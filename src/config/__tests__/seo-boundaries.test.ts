import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_SITE_ORIGIN,
  MIDDLEWARE_PUBLIC_META,
  etfDetailSymbolFromPath,
  isKnownIpoListingPath,
  isNoindexPath,
  stockDetailSymbolFromPath,
} from "../../../seo-boundaries.ts";
import {
  STATIC_SITEMAP_PATHS,
  assertCanonicalOriginAligned,
} from "@/config/seo";

describe("seo-boundaries", () => {
  it("uses stocksist.com apex origin", () => {
    expect(CANONICAL_SITE_ORIGIN).toBe("https://stocksist.com");
    assertCanonicalOriginAligned();
  });

  it("marks auth and dashboard paths as noindex", () => {
    expect(isNoindexPath("/login")).toBe(true);
    expect(isNoindexPath("/dashboard/screeners")).toBe(true);
    expect(isNoindexPath("/news")).toBe(false);
  });

  it("parses stock detail symbols but not reserved nested routes", () => {
    expect(stockDetailSymbolFromPath("/stocks/AAPL")).toBe("AAPL");
    expect(stockDetailSymbolFromPath("/stocks/compare")).toBeNull();
    expect(stockDetailSymbolFromPath("/stocks/lists/growth")).toBeNull();
    expect(stockDetailSymbolFromPath("/stocks/analysts/jane-doe")).toBeNull();
  });

  it("parses ETF detail on /etf and /etfs without reserved segments", () => {
    expect(etfDetailSymbolFromPath("/etf/SPY")).toBe("SPY");
    expect(etfDetailSymbolFromPath("/etfs/QQQ")).toBe("QQQ");
    expect(etfDetailSymbolFromPath("/etf/screener")).toBeNull();
    expect(etfDetailSymbolFromPath("/etf/compare")).toBeNull();
    expect(etfDetailSymbolFromPath("/etfs/screener")).toBeNull();
  });

  it("allows only known IPO listing paths", () => {
    expect(isKnownIpoListingPath("/ipos/recent")).toBe(true);
    expect(isKnownIpoListingPath("/ipos/ACME")).toBe(false);
  });

  it("static sitemap paths align with middleware public meta keys where overlapping", () => {
    for (const path of ["/screener", "/markets/heatmap", "/trending"]) {
      expect(STATIC_SITEMAP_PATHS.includes(path as never)).toBe(true);
      expect(MIDDLEWARE_PUBLIC_META[path]).toBeDefined();
    }
  });

  it("does not ship a static public/sitemap.xml (Vercel rewrite serves Edge index)", () => {
    const sitemapPath = join(process.cwd(), "public/sitemap.xml");
    expect(() => readFileSync(sitemapPath, "utf8")).toThrow();
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      rewrites: { source: string; destination: string }[];
    };
    const rewrite = vercel.rewrites.find((r) => r.source === "/sitemap.xml");
    expect(rewrite?.destination).toBe(
      "https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sitemap",
    );
    expect(STATIC_SITEMAP_PATHS.includes("/markets/heatmap" as never)).toBe(true);
  });

  it("homepage is not synthesized by middleware matcher", () => {
    const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    expect(middleware).not.toMatch(/matcher:\s*\[[\s\S]*"\/",/);
  });

  it("index.html preserves Search Console verification and JSON-LD", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('name="google-site-verification"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("https://stocksist.com/");
  });
});
