import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNewsletterFromAddress,
  LEGACY_NEWSLETTER_SEND_DOMAIN,
  resendNewsletterEnvelope,
  TARGET_STOCKSIST_SEND_DOMAIN,
} from "./sender-config.ts";

Deno.test("default envelope uses Stocksist display name and legacy send domain", () => {
  const env = resendNewsletterEnvelope({});
  assertEquals(env.from.includes("Stocksist Market Bullets"), true);
  assertEquals(env.from.includes(`@${LEGACY_NEWSLETTER_SEND_DOMAIN}`), true);
  assertEquals(env.using_legacy_domain, true);
  assertEquals(env.reply_to, "info@stocksist.com");
  assertEquals(env.from.includes("HedgeFun"), false);
});

Deno.test("missing new domain falls back to legacy", () => {
  assertEquals(
    buildNewsletterFromAddress({ NEWSLETTER_SEND_DOMAIN: "" }),
    buildNewsletterFromAddress({}),
  );
});

Deno.test("NEWSLETTER_SEND_DOMAIN selects Stocksist subdomain when set", () => {
  const from = buildNewsletterFromAddress({
    NEWSLETTER_SEND_DOMAIN: TARGET_STOCKSIST_SEND_DOMAIN,
  });
  assertEquals(from.includes(`@${TARGET_STOCKSIST_SEND_DOMAIN}`), true);
  assertEquals(from.includes(LEGACY_NEWSLETTER_SEND_DOMAIN), false);
});

Deno.test("NEWSLETTER_FORCE_LEGACY_SEND overrides configured domain", () => {
  const from = buildNewsletterFromAddress({
    NEWSLETTER_SEND_DOMAIN: TARGET_STOCKSIST_SEND_DOMAIN,
    NEWSLETTER_FORCE_LEGACY_SEND: "true",
  });
  assertEquals(from.includes(`@${LEGACY_NEWSLETTER_SEND_DOMAIN}`), true);
});

Deno.test("custom display name and reply-to from env", () => {
  const env = resendNewsletterEnvelope({
    NEWSLETTER_FROM_DISPLAY_NAME: "Stocksist Alerts",
    NEWSLETTER_REPLY_TO: "support@stocksist.com",
  });
  assertEquals(env.from.startsWith("Stocksist Alerts <"), true);
  assertEquals(env.reply_to, "support@stocksist.com");
});
