import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyIntelligence } from "../classify.ts";
import { V1A_MANDATORY_FLAGS } from "../flags.ts";
import { evaluateCatalystIntelligence } from "../pipeline.ts";
import { qualifyForAlert } from "../qualify.ts";
import { COMMENTARY_SCORE_CAP, ORDINARY_CONTEXT_SCORE_CAP } from "../score.ts";
import { baseRow, nowMs } from "./fixtures.ts";
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
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assert(record.scores.catalyst_score <= COMMENTARY_SCORE_CAP, `${label} ${record.scores.catalyst_score}`);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "COMMENTARY", label);
}

function assertOrdinaryContext(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "context", `${label} class`);
  assertEquals(classified.context_actionability, "ordinary", `${label} actionability`);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assert(record.scores.catalyst_score < 60, `${label} score ${record.scores.catalyst_score}`);
  assert(
    record.scores.catalyst_score <= ORDINARY_CONTEXT_SCORE_CAP,
    `${label} ordinary cap ${record.scores.catalyst_score}`,
  );
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "CONTEXT_ONLY", label);
}

Deno.test("V1B.2 PFE retrospective August recap is commentary even with body earnings", () => {
  assertCommentarySuppressed(
    row({
      symbol: "PFE",
      event_type: "fda_biotech",
      title: "Why Pfizer Stock Was so Healthy in August",
      description:
        "Pfizer beat quarterly earnings estimates last month as the company reported strong Q2 results.",
    }),
    "PFE",
  );
  const classified = classifyIntelligence(row({
    symbol: "PFE",
    event_type: "fda_biotech",
    title: "Why Pfizer Stock Was so Healthy in August",
    description: "Pfizer beat quarterly earnings estimates last month.",
  }));
  assert(classified.reasons.includes("retrospective_performance_frame"));
});

Deno.test("V1B.2 CRSP retrospective monthly recap remains commentary", () => {
  assertCommentarySuppressed(
    row({
      symbol: "CRSP",
      event_type: "fda_biotech",
      title: "Why CRISPR Therapeutics Stock Rocked the Market Last Month",
      description: "CRISPR Therapeutics stock surged nearly 19% in August following strong Q2 earnings.",
    }),
    "CRSP",
  );
});

Deno.test("V1B.2 contemporaneous monthly operating results are not automatic commentary", () => {
  const sales = classifyIntelligence(row({
    title: "Example Corp reports August sales increased 20%",
    event_type: "company_news",
  }));
  assertEquals(sales.classification === "commentary", false, "August sales");

  const production = classifyIntelligence(row({
    title: "Example Corp announces August production results",
    event_type: "company_news",
  }));
  assertEquals(production.classification === "commentary", false, "August production");

  const datedPrint = classifyIntelligence(row({
    title: "Example Corp reports Q2 results in August",
    event_type: "company_news",
  }));
  assertEquals(datedPrint.classification === "commentary", false, "Q2 results in August");
});

Deno.test("V1B.2 ordinary context stays below 60 and cannot alert", () => {
  assertOrdinaryContext(
    row({
      symbol: "CWT",
      title: "California Water Service Kicks Off Back-to-School Season With 13th Year of Tap Into Learning",
    }),
    "CSR",
  );
  assertOrdinaryContext(
    row({
      symbol: "IBIT",
      title: "Crypto Market Today, Sept. 8: Bitcoin Slides as Fed Hike Odds Pass 60%",
    }),
    "market wrap",
  );
  assertOrdinaryContext(
    row({
      symbol: "CORZ",
      event_type: "analyst_action",
      title: "Core Scientific Director Purchases 7,000 Shares",
    }),
    "insider",
  );
  assertOrdinaryContext(
    row({
      symbol: "MCRB",
      title: "Seres Therapeutics Reports Inducement Grants Under Nasdaq Listing Rule 5635(c)(4)",
    }),
    "inducement",
  );
  assertOrdinaryContext(
    row({
      symbol: "META",
      event_type: "earnings",
      title: "HealthEx Empowers Consumers to Bring Their Personal Health History to Muse, Meta’s New Personal Health App",
    }),
    "partner product",
  );
  assertOrdinaryContext(
    row({
      symbol: "AVEX",
      title:
        "AEVEX Corp. Notice of October 20, 2026 Application Deadline for Class Action Lawsuit - Contact Lewis Kahn, Esq. at Kahn Swick & Foti, LLC, Before Application Deadline",
    }),
    "legal deadline",
  );
});

Deno.test("V1B.2 material context may score above 55 but still cannot alert", () => {
  const input = row({
    symbol: "ACME",
    event_type: "company_news",
    title:
      "EPA issues industry-wide export-control ban affecting lithium producers; Acme operations exposure detailed",
    description:
      "The EPA export-control ban is an industry-wide regulatory action. Acme has direct operations exposure as a lithium producer.",
  });
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "context");
  assertEquals(classified.context_actionability, "material");
  assert(classified.reasons.includes("material_context_escape"));
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.classification, "context");
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false);
  assertEquals(q.reason, "CONTEXT_ONLY");
});

Deno.test("V1B.2 ticker mention alone does not create material context", () => {
  const input = row({
    title: "Markets drift as traders watch Acme and peers",
    description: "No regulatory action, commodity shock, or geopolitical exposure is stated.",
  });
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "context");
  assertEquals(classified.context_actionability, "ordinary");
});
