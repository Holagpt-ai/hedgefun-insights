import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BRAND, LEGACY_NEWSLETTER_SEND_DOMAIN, newsletterFromAddress } from "./brand.ts";

Deno.test("edge BRAND matches Stocksist public values", () => {
  assertEquals(BRAND.name, "Stocksist");
  assertEquals(BRAND.displayDomain, "Stocksist.com");
  assertEquals(BRAND.aiProductName, "Stocksist AI");
});

Deno.test("newsletter from uses Stocksist display name with legacy send domain", () => {
  const from = newsletterFromAddress();
  assertEquals(from.includes("Stocksist"), true);
  assertEquals(from.includes(LEGACY_NEWSLETTER_SEND_DOMAIN), true);
  assertEquals(from.includes("HedgeFun"), false);
});
