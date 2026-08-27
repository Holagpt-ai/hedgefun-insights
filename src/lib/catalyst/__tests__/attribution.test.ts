import { describe, it, expect } from "vitest";
import {
  attributeStory,
  attributeSymbol,
  dedupeStories,
  NO_VERIFIED_CATALYST,
} from "@/lib/catalyst/attribution";

describe("strict catalyst-to-ticker attribution", () => {
  it("does not attach an Nvidia-primary story to TSLA", () => {
    const results = attributeStory({
      title: "Nvidia unveils next-generation AI accelerator, shares jump",
      tickers: [
        { symbol: "NVDA", companyName: "NVIDIA Corporation" },
        { symbol: "TSLA", companyName: "Tesla, Inc." },
      ],
    });
    const nvda = results.find((r) => r.symbol === "NVDA")!;
    const tsla = results.find((r) => r.symbol === "TSLA")!;
    expect(nvda.class).toBe("direct");
    expect(nvda.ticker_specific).toBe(true);
    expect(tsla.ticker_specific).toBe(false);
    expect(tsla.class).toBe("unverified");
  });

  it("does not attach an Nvidia-primary story to TSLA even when the provider list is only TSLA", () => {
    const r = attributeSymbol({
      title: "Nvidia unveils next-generation AI accelerator, shares jump",
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      providerTickers: ["TSLA"],
      providerAssociatesSymbol: true,
    });
    expect(r.ticker_specific).toBe(false);
    expect(r.class).toBe("unverified");
    expect(r.reason).toBe("title_subject_is_other_entity");
  });

  it("does not attach a Tesla-primary story to SPCX", () => {
    const results = attributeStory({
      title: "Tesla reports record deliveries as Cybertruck ramps",
      tickers: [
        { symbol: "TSLA", companyName: "Tesla, Inc." },
        { symbol: "SPCX", companyName: "SPCX Holdings" },
      ],
    });
    expect(results.find((r) => r.symbol === "TSLA")?.class).toBe("direct");
    expect(results.find((r) => r.symbol === "SPCX")?.ticker_specific).toBe(false);
  });

  it("does not turn NuScale/Oklo-primary stories into TSLA catalysts", () => {
    const results = attributeStory({
      title: "NuScale Power and Oklo surge after nuclear energy policy shift",
      tickers: [
        { symbol: "SMR", companyName: "NuScale Power Corporation" },
        { symbol: "OKLO", companyName: "Oklo Inc." },
        { symbol: "TSLA", companyName: "Tesla, Inc." },
      ],
    });
    expect(results.find((r) => r.symbol === "SMR")?.ticker_specific).toBe(true);
    expect(results.find((r) => r.symbol === "OKLO")?.ticker_specific).toBe(true);
    const tsla = results.find((r) => r.symbol === "TSLA")!;
    expect(tsla.ticker_specific).toBe(false);
    expect(["unverified", "sector_related"]).toContain(tsla.class);
  });

  it("does not treat a generic multi-stock article as a strong direct catalyst", () => {
    const results = attributeStory({
      title: "These 10 stocks to watch before the opening bell",
      tickers: [
        { symbol: "AAPL", companyName: "Apple Inc." },
        { symbol: "MSFT", companyName: "Microsoft Corporation" },
        { symbol: "AMZN", companyName: "Amazon.com, Inc." },
        { symbol: "GOOGL", companyName: "Alphabet Inc." },
        { symbol: "META", companyName: "Meta Platforms, Inc." },
      ],
    });
    expect(results.every((r) => r.class !== "direct")).toBe(true);
    expect(results.every((r) => r.ticker_specific === false)).toBe(true);
    expect(results.every((r) => r.class === "sector_related")).toBe(true);
  });

  it("keeps a named company story even when the provider list includes another ticker", () => {
    const r = attributeSymbol({
      title: "Apple reports record iPhone sales",
      symbol: "AAPL",
      companyName: "Apple Inc.",
      providerTickers: ["AAPL", "MSFT"],
      providerAssociatesSymbol: true,
    });
    expect(r.class).toBe("direct");
    expect(r.ticker_specific).toBe(true);
  });

  it("marks a single-ticker provider association as reliable when no competing subject exists", () => {
    const r = attributeSymbol({
      title: "Company announces expanded manufacturing footprint",
      symbol: "AMD",
      companyName: "Advanced Micro Devices, Inc.",
      providerTickers: ["AMD"],
      providerAssociatesSymbol: true,
    });
    expect(r.class).toBe("provider_associated");
    expect(r.ticker_specific).toBe(true);
    expect(r.reason).toBe("single_provider_association");
  });

  it("deduplicates by canonical URL, headline and provider story id", () => {
    const rows = [
      { id: "1", title: "Hello World", source_url: "https://ex.com/a/", provider_article_id: "p1" },
      { id: "2", title: "Hello World", source_url: "https://ex.com/a", provider_article_id: "p1" },
      { id: "3", title: "Completely Different Story", source_url: "https://ex.com/b" },
      { id: "4", title: "Hello  World", source_url: "https://ex.com/c" },
    ];
    const out = dedupeStories(rows);
    expect(out.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("exports the required AI disclosure copy", () => {
    expect(NO_VERIFIED_CATALYST).toBe("No verified ticker-specific catalyst available.");
  });
});
