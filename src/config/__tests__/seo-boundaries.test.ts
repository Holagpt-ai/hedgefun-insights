import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_SITE_ORIGIN,
  MIDDLEWARE_PUBLIC_META,
  isNoindexPath,
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

  it("static sitemap paths align with middleware public meta keys where overlapping", () => {
    for (const path of ["/", "/screener", "/markets/heatmap", "/trending"]) {
      expect(STATIC_SITEMAP_PATHS.includes(path as never)).toBe(true);
      expect(MIDDLEWARE_PUBLIC_META[path]).toBeDefined();
    }
  });

  it("static fallback sitemap includes heatmap", () => {
    const xml = readFileSync(join(process.cwd(), "public/sitemap.xml"), "utf8");
    expect(xml).toContain("https://stocksist.com/markets/heatmap");
    expect(xml).not.toContain("/ipos/SYMBOL");
  });
});
