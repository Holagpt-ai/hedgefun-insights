import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRO_SUBSCRIPTION_FEATURE_BULLETS,
  PUBLIC_EXTENDED_HOURS_POSITIONING,
  PUBLIC_HERO_SUBTITLE,
  SUBSCRIPTION_MARKET_DATA_FEATURE,
} from "@/lib/public/public-market-copy";

const root = process.cwd();

const PUBLIC_ISS038_FILES = [
  "src/pages/Index.tsx",
  "src/contexts/LanguageContext.tsx",
  "src/components/home/HeroSearch.tsx",
  "src/pages/static/FaqPage.tsx",
  "src/pages/static/AboutPage.tsx",
  "src/pages/static/MethodologyPage.tsx",
  "src/pages/static/DownloadPage.tsx",
  "src/pages/static/DisclaimerPage.tsx",
  "src/pages/account/BillingPage.tsx",
  "src/pages/etf/EtfMainPage.tsx",
  "src/pages/stocks/StockListsPage.tsx",
  "src/pages/stocks/StockListDetailPage.tsx",
  "src/pages/stocks/StockExchangesPage.tsx",
];

describe("Batch 202 — ISS-038 delayed-data copy", () => {
  it("hero subtitles avoid real-time claims", () => {
    expect(PUBLIC_HERO_SUBTITLE.en.toLowerCase()).toMatch(/delayed/);
    expect(PUBLIC_HERO_SUBTITLE.en.toLowerCase()).not.toMatch(/real-time/);
    expect(PUBLIC_HERO_SUBTITLE.es.toLowerCase()).toMatch(/retraso/);
  });

  it("public marketing surfaces avoid unsupported real-time wording", () => {
    for (const file of PUBLIC_ISS038_FILES) {
      const src = readFileSync(resolve(file), "utf8");
      expect(src.toLowerCase()).not.toMatch(/real-time/);
      expect(src.toLowerCase()).not.toMatch(/real\s+time/);
      expect(src.toLowerCase()).not.toMatch(/tiempo real/);
    }
  });

  it("public marketing surfaces avoid unsupported live market data claims", () => {
    for (const file of PUBLIC_ISS038_FILES) {
      const src = readFileSync(resolve(file), "utf8");
      expect(src.toLowerCase()).not.toMatch(/live market data/);
    }
  });

  it("billing and admin plan copy use delayed-data policy constants", () => {
    expect(SUBSCRIPTION_MARKET_DATA_FEATURE.toLowerCase()).toMatch(/15-minute delayed/);
    expect(SUBSCRIPTION_MARKET_DATA_FEATURE.toLowerCase()).not.toMatch(/real-time/);
    expect(PRO_SUBSCRIPTION_FEATURE_BULLETS[0]).toBe(SUBSCRIPTION_MARKET_DATA_FEATURE);
    const billing = readFileSync(resolve("src/pages/account/BillingPage.tsx"), "utf8");
    expect(billing).toContain("PRO_SUBSCRIPTION_FEATURE_BULLETS");
    expect(billing).not.toMatch(/Real-time market data/);
  });

  it("index sparkline regular-session label is not Live", () => {
    const spark = readFileSync(resolve("src/components/home/IndexSparklineCards.tsx"), "utf8");
    expect(spark).toContain('"Regular"');
    expect(spark).not.toMatch(/label: "Live"/);
  });
});

describe("Batch 202 — 23×5 extended-hours positioning", () => {
  it("states premarket/RTH/after-hours without overnight scanning", () => {
    expect(PUBLIC_EXTENDED_HOURS_POSITIONING).toMatch(/4:00–9:30/);
    expect(PUBLIC_EXTENDED_HOURS_POSITIONING).toMatch(/4:00–8:00/);
    expect(PUBLIC_EXTENDED_HOURS_POSITIONING.toLowerCase()).toMatch(/overnight scanning is not active/);
    const hero = readFileSync(resolve("src/components/home/v21/HomepageHeroV21.tsx"), "utf8");
    expect(hero).toContain("PUBLIC_EXTENDED_HOURS_POSITIONING");
  });
});

describe("Batch 202 — conversion tracking on public auth CTAs", () => {
  it("header and footer fire auth_handoff events", () => {
    const header = readFileSync(resolve("src/components/layout/Header.tsx"), "utf8");
    const footer = readFileSync(resolve("src/components/layout/Footer.tsx"), "utf8");
    expect(header).toContain("trackAuthHandoff");
    expect(header).toContain("header_signup");
    expect(footer).toContain("trackAuthHandoff");
    expect(footer).toContain("footer_signup");
    const toolGrid = readFileSync(resolve("src/components/home/ToolGrid.tsx"), "utf8");
    expect(toolGrid).toContain("trackAuthHandoff");
  });
});

describe("Batch 202 — SEO & homepage integrity (regression)", () => {
  it("reuses established homepage modules", () => {
    const index = readFileSync(resolve("src/pages/Index.tsx"), "utf8");
    expect(index).toContain("SignificantMarketMovesV21");
    expect(index).toContain("<GlobalMarketClocks");
    expect(index).toContain("HOMEPAGE_V21_HEADLINE");
    expect(index).not.toContain("AiTraderLivePreview");
  });

  it("LanguageContext wires hero subtitle from public copy module", () => {
    const lang = readFileSync(resolve("src/contexts/LanguageContext.tsx"), "utf8");
    expect(lang).toContain("public-market-copy");
    expect(lang).toContain("PUBLIC_HERO_SUBTITLE.en");
  });
});