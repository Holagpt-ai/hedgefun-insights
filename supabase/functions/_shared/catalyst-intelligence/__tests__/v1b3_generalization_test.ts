import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyIntelligence } from "../classify.ts";
import { V1A_MANDATORY_FLAGS } from "../flags.ts";
import { evaluateCatalystIntelligence } from "../pipeline.ts";
import { qualifyForAlert } from "../qualify.ts";
import { COMMENTARY_SCORE_CAP } from "../score.ts";
import {
  hasObjectiveEarningsEvidence,
  hasObjectiveMaEvidence,
} from "../semantic.ts";
import { baseRow, nowMs, occScheduledEarnings } from "./fixtures.ts";
import type { NormalizedCatalystInput } from "../types.ts";

function row(overrides: Partial<NormalizedCatalystInput>): NormalizedCatalystInput {
  return baseRow({
    facts: { attribution_class: "direct", ticker_specific: true },
    ...overrides,
  });
}

function assertRealMa(input: NormalizedCatalystInput, label: string): void {
  assert(hasObjectiveMaEvidence(input.title, input.description), `${label} ma evidence`);
  const classified = classifyIntelligence(input);
  assert(
    classified.classification === "hard" || classified.classification === "emerging",
    `${label} expected real M&A, got ${classified.classification}`,
  );
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assertEquals(record.classification === "commentary", false, `${label} not commentary`);
}

function assertNotObjectiveMa(title: string, description: string | null, label: string): void {
  assertEquals(hasObjectiveMaEvidence(title, description), false, `${label} no ma evidence`);
}

function assertCommentarySuppressed(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "commentary", `${label} class`);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assert(record.scores.catalyst_score <= COMMENTARY_SCORE_CAP, `${label} cap`);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "COMMENTARY", label);
}

function assertOrdinaryContext(input: NormalizedCatalystInput, label: string): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "context", `${label} class`);
  assertEquals(classified.context_actionability, "ordinary", `${label} ordinary`);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assert(record.scores.catalyst_score < 60, `${label} score ${record.scores.catalyst_score}`);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "CONTEXT_ONLY", label);
}

Deno.test("V1B.3 definitive agreement to acquire is objective M&A regardless of event_type", () => {
  const cases: Array<[string, string]> = [
    ["Company enters into definitive agreement to acquire Target", "enters"],
    ["Company entered into definitive agreement to acquire Target", "entered"],
    ["Company has entered into a definitive agreement to acquire Target", "has entered"],
    ["Company announced a definitive agreement to acquire Target", "announced"],
    ["Company signed a definitive agreement to acquire Target", "signed"],
    ["Company announces definitive agreement to acquire Target", "announces"],
    ["Company signs definitive agreement to acquire Target", "signs"],
  ];
  for (const [title, label] of cases) {
    assertRealMa(
      row({
        event_type: "company_news",
        title,
      }),
      label,
    );
  }

  const mistypedFda = classifyIntelligence(row({
    event_type: "fda_biotech",
    title: "Example Corp Enters into Definitive Agreement to Acquire BioDevice Co",
    description: "Example Corp announced a definitive agreement to acquire BioDevice Co for $200 million in cash.",
  }));
  assertEquals(mistypedFda.classification, "hard");
  assert(mistypedFda.reasons.includes("semantic_promotion:asset_sale_or_ma"));
  assertEquals(mistypedFda.reasons.some((r) => r.includes("event_type_hint")), false);
});

Deno.test("V1B.3 speculative or investigative M&A wording is not objective evidence", () => {
  const negatives: Array<[string, string | null, string]> = [
    ["Example Corp may acquire Target next year", null, "may acquire"],
    ["Example Corp could acquire a rival if talks succeed", null, "could acquire"],
    ["Example Corp is considering an acquisition in software", null, "considering"],
    ["Example Corp is reportedly interested in acquiring Target", null, "reportedly interested"],
    ["Example Corp is exploring a possible acquisition", null, "exploring possible"],
    ["Acquisition rumors swirl around Example Corp and Target", null, "rumors"],
    ["Analyst says Example Corp should acquire Target", null, "analyst should acquire"],
    [
      "$HAREHOLDER ALERT: The M&A Class Action Firm Continues to Investigate the Merger—IRDM, VRME, VAL and LAB",
      "Monteverde & Associates PC is investigating four merger transactions.",
      "law firm investigating merger",
    ],
    [
      "Shareholder alert concerning a merger investigation at Example Corp",
      "The firm is investigating a proposed merger.",
      "shareholder investigation",
    ],
    ["Why Example Corp's 2019 acquisition still matters", null, "historical retrospective"],
    ["5 acquisition candidates investors should watch this year", null, "listicle candidates"],
    ["Example Corp may announce a definitive agreement to acquire Target", null, "may announce definitive"],
    ["Example Corp could enter into a definitive agreement to acquire Target", null, "could enter"],
  ];
  for (const [title, description, label] of negatives) {
    assertNotObjectiveMa(title, description, label);
  }

  assertOrdinaryContext(
    row({
      event_type: "merger_acquisition",
      title: "Example Corp may acquire a competitor if financing appears",
    }),
    "event_type cannot rescue speculation",
  );
  assertCommentarySuppressed(
    row({
      event_type: "merger_acquisition",
      title:
        "Deadline Alert: Example Corp Shareholders Who Lost Money Urged To Contact Counsel About Merger Investigation",
      source_name: "Glancy Prongay Wolke & Rotter LLP",
    }),
    "investigation + merger event_type",
  );
});

Deno.test("V1B.3 reported-result phrasing is objective earnings evidence", () => {
  assert(hasObjectiveEarningsEvidence("Example Corp reported second-quarter results", null));
  assert(hasObjectiveEarningsEvidence("Example Corp reported Q2 revenue of $161 million", null));
  assert(
    hasObjectiveEarningsEvidence(
      "Example Corp Q2 print",
      "The company posted an EPS of -$0.35, beating the consensus estimate of -$0.39.",
    ),
  );
  assert(hasObjectiveEarningsEvidence("Example Corp reported first-quarter fiscal 2027 results", null));
  assert(hasObjectiveEarningsEvidence("Example Corp tops revenue estimates after Q2 print", null));
  assert(
    hasObjectiveEarningsEvidence(
      "Example Corp Q2 recap",
      "Sales came in missing the consensus estimate after the company reported Q2 revenue.",
    ),
  );

  const q2Results = classifyIntelligence(row({
    event_type: "company_news",
    title: "Example Corp reported second-quarter results",
  }));
  assertEquals(q2Results.classification, "emerging");
  assert(q2Results.reasons.includes("semantic_promotion:earnings_result"));

  const q2Revenue = classifyIntelligence(row({
    event_type: "earnings",
    title: "Example Corp reported Q2 revenue",
    description: "Example Corp reported Q2 revenue of $161.25 million.",
  }));
  assertEquals(q2Revenue.classification, "emerging");

  const consensus = classifyIntelligence(row({
    event_type: "earnings",
    title: "Example Corp Q2 Earnings: Key Metrics Versus Estimates",
    description: "The company posted an EPS of $0.40, beating the consensus estimate of $0.37.",
  }));
  assertEquals(consensus.classification, "emerging");
});

Deno.test("V1B.3 earnings previews and editorial frames stay non-result", () => {
  assertEquals(
    hasObjectiveEarningsEvidence("What to expect from Example Corp earnings next week", null),
    false,
  );
  assertEquals(
    hasObjectiveEarningsEvidence("Example Corp is expected to report Q2 revenue next Thursday", null),
    false,
  );
  assertEquals(
    hasObjectiveEarningsEvidence("Example Corp will report Q2 results after the close", null),
    false,
  );

  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "What to Expect From Example Corp Earnings Next Week",
      description: "Analysts are previewing the print and whether estimates are too high.",
    }),
    "what to expect",
  );
  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "Example Corp Stock Ahead of Earnings: Is a Beat Coming?",
    }),
    "ahead of earnings",
  );
  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "Example Corp Earnings Preview: Estimates in Focus",
    }),
    "earnings preview",
  );
  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "Is Example Corp a Buy Before Earnings?",
    }),
    "buy before earnings",
  );
  assertCommentarySuppressed(
    row({
      event_type: "earnings",
      title: "Example Corp Down 8% Since Last Earnings Report: Can It Rebound?",
      description: "The company reported Q2 results last month and beat estimates.",
    }),
    "since last earnings still blocked",
  );
  assertOrdinaryContext(
    row({
      event_type: "earnings",
      title: "Example Corp scheduled investor day as traders wait for the next print",
    }),
    "no actual result language",
  );
});

Deno.test("V1B.3 scheduled earnings policy is unchanged", () => {
  const classified = classifyIntelligence(occScheduledEarnings());
  assertEquals(classified.classification, "hard");
  assertEquals(classified.direction, "unknown");
  assertEquals(classified.fact_state, "provider_fact");
  assert(classified.reasons.includes("earnings_calendar_scheduled"));
  assertEquals(hasObjectiveEarningsEvidence(occScheduledEarnings().title, occScheduledEarnings().description), false);
  const record = evaluateCatalystIntelligence(occScheduledEarnings(), nowMs());
  assertExists(record);
  assertEquals(record.lifecycle, "scheduled");
  assertEquals(record.direction, "unknown");
});
