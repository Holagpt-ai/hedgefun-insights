import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SITEMAP_MAIN_PAGES } from "./sitemap-main-pages.ts";

Deno.test("main sitemap excludes dashboard auth and watchlist", () => {
  const paths = SITEMAP_MAIN_PAGES.map((p) => p.path);
  assertEquals(paths.some((p) => p.startsWith("/dashboard")), false);
  assertEquals(paths.includes("/watchlist"), false);
  assertEquals(paths.includes("/login"), false);
  assertEquals(paths.every((p) => p.startsWith("/")), true);
});
