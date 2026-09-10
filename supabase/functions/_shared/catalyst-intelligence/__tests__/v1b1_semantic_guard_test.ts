import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyIntelligence } from "../classify.ts";
import { V1A_MANDATORY_FLAGS } from "../flags.ts";
import { evaluateCatalystIntelligence } from "../pipeline.ts";
import { qualifyForAlert } from "../qualify.ts";
import { COMMENTARY_SCORE_CAP } from "../score.ts";
import { baseRow, nowMs, occScheduledEarnings, secEightK } from "./fixtures.ts";
import type { NormalizedCatalystInput } from "../types.ts";

function row(overrides: Partial<NormalizedCatalystInput>): NormalizedCatalystInput {
  return baseRow({
    facts: { attribution_class: "direct", ticker_specific: true },
    ...overrides,
  });
}

function assertCommentarySuppressed(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "commentary", `${label} class`);
  assertEquals(classified.direction, "unknown", `${label} direction`);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assertEquals(record.classification, "commentary", `${label} record class`);
  assert(record.scores.catalyst_score <= COMMENTARY_SCORE_CAP, `${label} cap ${record.scores.catalyst_score}`);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "COMMENTARY", `${label} qualification`);
}

function assertRealEvent(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assert(
    classified.classification === "hard" || classified.classification === "emerging",
    `${label} expected real event, got ${classified.classification}`,
  );
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assertEquals(record.classification === "commentary", false, `${label} not commentary`);
}

function assertContextNoAlert(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "context", `${label} class`);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "CONTEXT_ONLY", `${label} qualification`);
}

Deno.test("V1B.1 editorial dividend and buy-advice headlines are commentary", () => {
  assertCommentarySuppressed(
    row({
      symbol: "WTBA",
      event_type: "corporate_action",
      title: "Why West Bancorp (WTBA) is a Great Dividend Stock Right Now",
    }),
    "WTBA",
  );
  assertCommentarySuppressed(
    row({
      symbol: "TMP",
      event_type: "corporate_action",
      title: "Are You Looking for a High-Growth Dividend Stock?",
    }),
    "TMP",
  );
  assertCommentarySuppressed(
    row({
      symbol: "LRCX",
      event_type: "earnings",
      title: "Wall Street Analysts Think Lam Research (LRCX) Is a Good Investment: Is It?",
    }),
    "LRCX",
  );
  assertCommentarySuppressed(
    row({
      symbol: "MHO",
      event_type: "earnings",
      title: "Wall Street Analysts Think M/I Homes (MHO) Is a Good Investment: Is It?",
    }),
    "MHO",
  );
  assertCommentarySuppressed(
    row({
      symbol: "SOUN",
      event_type: "earnings",
      title: "Brokers Suggest Investing in SoundHound AI (SOUN): Read This Before Placing a Bet",
    }),
    "SOUN",
  );
  assertCommentarySuppressed(
    row({
      symbol: "ORCL",
      event_type: "earnings",
      title: "Zacks Investment Ideas feature highlights: Oracle",
    }),
    "ORCL",
  );
  assertCommentarySuppressed(
    row({
      symbol: "MU",
      event_type: "sec_filing_news",
      title: "Thinking of Buying Micron Stock Now? Here's 1 Green Flag and 1 Red Flag.",
    }),
    "MU buy-advice",
  );
});

Deno.test("V1B.1 retrospective recaps and estimate-move stories are commentary", () => {
  assertCommentarySuppressed(
    row({
      symbol: "CRSP",
      event_type: "fda_biotech",
      title: "Why CRISPR Therapeutics Stock Rocked the Market Last Month",
      description:
        "CRISPR Therapeutics stock surged nearly 19% in August following strong Q2 earnings.",
    }),
    "CRSP",
  );
  assertCommentarySuppressed(
    row({
      symbol: "BBCP",
      event_type: "earnings",
      title: "Earnings Estimates Rising for Concrete Pumping (BBCP): Will It Gain?",
    }),
    "BBCP",
  );
  assertCommentarySuppressed(
    row({
      symbol: "VG",
      event_type: "earnings",
      title: "Earnings Estimates Moving Higher for Venture Global (VG): Time to Buy?",
    }),
    "VG",
  );
  assertCommentarySuppressed(
    row({
      symbol: "SPG",
      event_type: "earnings",
      title: "Simon Property (SPG) Down 3.5% Since Last Earnings Report: Can It Rebound?",
      description:
        "Simon Property Group reported strong Q2 2026 earnings with FFO of $3.29 per share beating estimates.",
    }),
    "SPG",
  );
  assertCommentarySuppressed(
    row({
      symbol: "RKLB",
      event_type: "earnings",
      title: "Rocket Lab Corporation (RKLB) Down 17.7% Since Last Earnings Report: Can It Rebound?",
    }),
    "RKLB",
  );
});

Deno.test("V1B.1 market-relative recaps are commentary", () => {
  for (
    const [symbol, title] of [
      ["NUE", "Nucor (NUE) Declines More Than Market: Some Information for Investors"],
      ["LEN", "Lennar (LEN) Registers a Bigger Fall Than the Market: Important Facts to Note"],
      ["AAL", "American Airlines (AAL) Dips More Than Broader Market: What You Should Know"],
      ["JNJ", "Johnson & Johnson (JNJ) Sees a More Significant Dip Than Broader Market: Some Facts to Know"],
      ["UUUU", "Energy Fuels (UUUU) Rises As Market Takes a Dip: Key Facts"],
      ["DAL", "Delta Air Lines (DAL) Declines More Than Market: Some Information for Investors"],
    ] as const
  ) {
    assertCommentarySuppressed(row({ symbol, event_type: "earnings", title }), symbol);
  }
});

Deno.test("V1B.1 why-stock-moved-today without contract evidence is commentary", () => {
  assertCommentarySuppressed(
    row({
      symbol: "QCOM",
      event_type: "product_contract",
      title: "Why Qualcomm Stock Is Up Today",
      description: "Qualcomm shares rose 8.7% following a partnership announcement with Amazon.",
    }),
    "QCOM",
  );
  assertCommentarySuppressed(
    row({
      symbol: "NBIS",
      event_type: "product_contract",
      title: "Why Nebius Stock Jumped Today",
      description: "Nebius Group announced a partnership with Palantir to deliver sovereign AI.",
    }),
    "NBIS",
  );
  assertCommentarySuppressed(
    row({
      symbol: "PLTR",
      event_type: "product_contract",
      title: "Why Nebius Stock Jumped Today",
      description: "Nebius Group announced a partnership with Palantir to deliver sovereign AI.",
    }),
    "PLTR",
  );
});

Deno.test("V1B.1 law-firm solicitation is commentary, not a legal catalyst", () => {
  assertCommentarySuppressed(
    row({
      symbol: "PRCT",
      event_type: "earnings",
      title:
        "PRCT DEADLINE: ROSEN, REGARDED INVESTOR COUNSEL, Encourages PROCEPT BioRobotics Corporation Investors with Losses in Excess of $100K to Secure Counsel Before Important September 22",
      source_name: "Rosen Law Firm",
    }),
    "PRCT Rosen",
  );
  assertCommentarySuppressed(
    row({
      symbol: "PRCT",
      event_type: "earnings",
      title:
        "REMINDER: PROCEPT BioRobotics Corporation Investors With Significant Losses Must Act By September 22, 2026 - Contact Kirby McInerney LLP",
    }),
    "PRCT reminder",
  );
  assertCommentarySuppressed(
    row({
      symbol: "EQPT",
      event_type: "company_news",
      title:
        "REMINDER: EquipmentShare.com Inc. Investors With Significant Losses Must Act By September 21, 2026 - Contact Kirby McInerney LLP",
    }),
    "EQPT",
  );
});

Deno.test("V1B.1 objective legal events are not treated as solicitation", () => {
  const classified = classifyIntelligence(row({
    symbol: "ACME",
    title: "DOJ charges ACME with securities fraud after court ruled on injunction",
    event_type: "company_news",
  }));
  assertEquals(classified.classification === "commentary", false);
});

Deno.test("V1B.1 earnings prints and announced results remain real events", () => {
  assertRealEvent(
    row({
      symbol: "CNM",
      event_type: "earnings",
      title: "Core & Main (CNM) Q2 Earnings and Revenues Surpass Estimates",
    }),
    "CNM",
  );
  assertRealEvent(
    row({
      symbol: "ODD",
      event_type: "earnings",
      title: "Oddity Tech (ODD) Beats Q2 Earnings and Revenue Estimates",
    }),
    "ODD",
  );
  assertRealEvent(
    row({
      symbol: "BRZE",
      event_type: "earnings",
      title: "Braze, Inc. (BRZE) Surpasses Q2 Earnings and Revenue Estimates",
    }),
    "BRZE",
  );
  assertRealEvent(
    row({
      symbol: "BNED",
      event_type: "earnings",
      title: "Barnes & Noble Education (BNED) Reports Q1 Loss, Misses Revenue Estimates",
    }),
    "BNED",
  );
  assertRealEvent(
    row({
      symbol: "TTAN",
      event_type: "earnings",
      title: "Why ServiceTitan Stock Is Crashing Today",
      description:
        "ServiceTitan stock plummeted 30% on Wednesday despite beating Q2 earnings and sales estimates, with raised full-year guidance and disappointing Q3 sales guidance.",
    }),
    "TTAN",
  );
  assertRealEvent(
    row({
      symbol: "YQ",
      event_type: "company_news",
      title: "17 Education & Technology Group Inc. Announces Second Quarter 2026 Unaudited Financial Results",
    }),
    "YQ",
  );
  assertRealEvent(
    row({
      symbol: "AEM",
      event_type: "company_news",
      title: "Agnico Eagle to Sell Delta and Helm Bay Projects to Vizsla Copper",
    }),
    "AEM",
  );
});

Deno.test("V1B.1 BATL/BKKT/HOOD promote only with objective evidence", () => {
  assertRealEvent(
    row({
      symbol: "BATL",
      event_type: "company_news",
      title:
        "Battalion Oil Corporation Announces Strategic Investment in Collide, the AI-Native Operations System for Oil and Gas",
    }),
    "BATL announced",
  );
  assertContextNoAlert(
    row({
      symbol: "BATL",
      event_type: "company_news",
      title: "What Battalion's Collide investment could mean for the sector",
    }),
    "BATL speculative",
  );

  assertRealEvent(
    row({
      symbol: "BKKT",
      event_type: "company_news",
      title: "Bakkt Raises 2026 Total Transacting Volume Outlook",
    }),
    "BKKT guidance",
  );
  assertContextNoAlert(
    row({
      symbol: "BKKT",
      event_type: "company_news",
      title: "Bakkt Expands Global Commercial Team as Growth Accelerates",
    }),
    "BKKT team",
  );

  assertCommentarySuppressed(
    row({
      symbol: "HOOD",
      event_type: "company_news",
      title: "Can Robinhood's Crypto.com Deal Supercharge Prediction Markets' Growth?",
      description: "Robinhood Markets has partnered with Crypto.com to route select football event contracts.",
    }),
    "HOOD editorial",
  );
  assertRealEvent(
    row({
      symbol: "HOOD",
      event_type: "company_news",
      title: "Robinhood announces partnership agreement with Crypto.com",
    }),
    "HOOD announced",
  );
});

Deno.test("V1B.1 ordinary insider activity is context, not analyst", () => {
  assertContextNoAlert(
    row({
      symbol: "CORZ",
      event_type: "analyst_action",
      title: "Core Scientific Director Purchases 7,000 Shares",
    }),
    "CORZ",
  );
  assertContextNoAlert(
    row({
      symbol: "TTWO",
      event_type: "earnings",
      title: "Take-Two CFO Sells 1,335 Company Shares as Grand Theft Auto 6 Nears Launch",
    }),
    "TTWO",
  );
});

Deno.test("V1B.1 event_type adversarial cases cannot override semantics", () => {
  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "Earnings Estimates Rising for Example Corp: Will It Gain?",
    }),
    "editorial + earnings type",
  );
  assertCommentarySuppressed(
    row({
      event_type: "corporate_action",
      title: "Why Example Corp is a Great Dividend Stock Right Now",
    }),
    "listicle + corporate_action",
  );
  assertCommentarySuppressed(
    row({
      event_type: "fda_biotech",
      title: "Why Example Biotech Stock Rocked the Market Last Month",
    }),
    "recap + fda_biotech",
  );
  assertCommentarySuppressed(
    row({
      event_type: "sec_filing_news",
      provider: "polygon",
      title: "Thinking of Buying Example Stock Now? Here's 1 Green Flag and 1 Red Flag.",
    }),
    "buy advice + sec_filing_news",
  );
  const secLabel = classifyIntelligence(row({
    event_type: "sec_filing_news",
    provider: "polygon",
    title: "Thinking of Buying Example Stock Now? Here's 1 Green Flag and 1 Red Flag.",
  }));
  assertEquals(secLabel.reasons.some((r) => r.startsWith("sec_")), false);
  assertEquals(secLabel.classification, "commentary");

  assertCommentarySuppressed(
    row({
      event_type: "product_contract",
      title: "Why Example Stock Jumped Today",
    }),
    "price recap + product_contract",
  );

  const insider = classifyIntelligence(row({
    event_type: "analyst_action",
    title: "Example Corp Director Purchases 4,000 Shares",
  }));
  assertEquals(insider.classification, "context");
  assert(insider.reasons.includes("ordinary_insider_activity"));

  const results = classifyIntelligence(row({
    event_type: "company_news",
    title: "Example Corp Announces Q2 2026 Unaudited Financial Results",
  }));
  assertEquals(results.classification, "emerging");
  assert(results.reasons.includes("semantic_promotion:earnings_result"));

  const sale = classifyIntelligence(row({
    event_type: "company_news",
    title: "Example Corp to Sell Delta and Helm Bay Projects",
  }));
  assertEquals(sale.classification, "hard");
  assert(sale.reasons.includes("semantic_promotion:asset_sale_or_ma"));
});

Deno.test("V1B.1 scheduled earnings and real SEC filings are unchanged", () => {
  const scheduled = classifyIntelligence(occScheduledEarnings());
  assertEquals(scheduled.classification, "hard");
  assertEquals(scheduled.direction, "unknown");
  assertEquals(scheduled.fact_state, "provider_fact");
  assert(scheduled.reasons.includes("earnings_calendar_scheduled"));

  const sec = evaluateCatalystIntelligence(secEightK(), nowMs());
  assertExists(sec);
  assertEquals(sec.provider, "sec_edgar");
  assertEquals(sec.classification, "hard");
  assertEquals(sec.direction, "unknown");
  assertEquals(sec.fact_state, "provider_fact");
});

Deno.test("V1B.1 commentary cannot be re-promoted by event_type in the same evaluation", () => {
  const classified = classifyIntelligence(row({
    event_type: "merger_acquisition",
    title: "Why Example Corp is a Great Dividend Stock Right Now",
  }));
  assertEquals(classified.classification, "commentary");
  assertEquals(classified.reasons.some((r) => r.includes("event_type")), false);
});
