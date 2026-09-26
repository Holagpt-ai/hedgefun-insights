import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_ORIGIN,
  NOINDEX_PATH_PREFIXES,
  STATIC_SITEMAP_PATHS,
  canonicalUrl,
  isNoindexPath,
  pathAllowedInStaticSitemap,
} from "@/config/seo";

describe("seo config", () => {
  it("uses https://stocksist.com as canonical origin", () => {
    expect(CANONICAL_ORIGIN).toBe("https://stocksist.com");
    expect(canonicalUrl("/news")).toBe("https://stocksist.com/news");
  });

  it("marks dashboard and account as noindex paths", () => {
    expect(isNoindexPath("/dashboard/screeners")).toBe(true);
    expect(isNoindexPath("/account/billing")).toBe(true);
    expect(isNoindexPath("/news")).toBe(false);
  });

  it("static sitemap paths exclude dashboard and watchlist", () => {
    for (const prefix of NOINDEX_PATH_PREFIXES) {
      if (prefix.startsWith("/dashboard")) {
        expect(pathAllowedInStaticSitemap("/dashboard")).toBe(false);
      }
    }
    expect(STATIC_SITEMAP_PATHS.some((p) => p.startsWith("/dashboard"))).toBe(false);
    expect(STATIC_SITEMAP_PATHS.includes("/watchlist" as never)).toBe(false);
  });
});

describe("public SEO artifacts", () => {
  it("robots.txt allows site and blocks private prefixes", () => {
    const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /dashboard/");
    expect(robots).toContain("Sitemap: https://stocksist.com/sitemap.xml");
    expect(robots.toLowerCase()).not.toContain("hedgefun");
  });

  it("index.html has Stocksist metadata and no HedgeFun", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("Stocksist");
    expect(html).toContain('rel="canonical" href="https://stocksist.com/"');
    expect(html).toContain("google-site-verification");
    expect(html.toLowerCase()).not.toContain("hedgefun");
  });
});
