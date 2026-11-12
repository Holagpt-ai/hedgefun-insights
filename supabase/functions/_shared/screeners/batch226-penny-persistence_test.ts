import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPennyContinuationHandoffUpsertRow,
  buildPennyContinuationHandoffUpsertRowsFromBundle,
} from "../am-inbox/capture-penny-continuation-handoffs.ts";
import { computePennyHandoffValidWindow } from "../am-inbox/penny-continuation-workflow-expiry.ts";
import { normalizePennyHandoffReadPairs } from "../am-inbox/penny-continuation-handoff-read-pairs.ts";
import { validatePennyHandoffUpsertPayload } from "../am-inbox/penny-continuation-handoff-upsert-validation.ts";
import type { PennyContinuationWorkflowHandoff } from "./penny-continuation-workflow-handoff-types.ts";

const SESSION = "2026-11-11";
const NEXT = "2026-11-12";

function qualifiedHandoff(
  overrides: Partial<PennyContinuationWorkflowHandoff> = {},
): PennyContinuationWorkflowHandoff {
  return {
    handoff_version: "penny_continuation_workflow_handoff_v1",
    integration_version: "penny_continuation_integration_v1",
    model_version: "penny_continuation_v1",
    symbol: "PNY",
    sourceSessionDate: SESSION,
    symbolObservationIso: "2026-11-11T14:59:55.000Z",
    captureIso: "2026-11-11T15:00:00.000Z",
    continuationQualified: true,
    corePassCount: 4,
    score: 75,
    rankKeys: { sharesPerMinute: 30_000, sessionVolume: 1_000_000, dollarVolume: 500_000 },
    dataFreshnessLabel: "live",
    supplementalLabels: [],
    evidenceProvenance: {
      symbolObservationMs: Date.parse("2026-11-11T14:59:55.000Z"),
      providerAsOfMs: null,
      generationSyncMs: 1_000,
      verifiedExpectedProviderDelayMs: null,
      dataDeliveryPolicy: "near_real_time",
      observedLagMs: null,
      feedDelayMs: null,
    },
    publicationIdempotencyKey: `${SESSION}:PNY:penny_continuation_v1:gen-a:24999999`,
    publicationSuppressed: false,
    badge: {
      kind: "penny_continuation_v1",
      symbol: "PNY",
      sessionDate: SESSION,
      continuationQualified: true,
      corePassCount: 4,
      dataFreshnessLabel: "live",
      score: 75,
      supplementalLabels: [],
      model_version: "penny_continuation_v1",
    },
    qualificationEvidenceKind: "live_market",
    stableRankingKey: "stable",
    ...overrides,
  };
}

Deno.test("batch226 penny valid window live same session", () => {
  const w = computePennyHandoffValidWindow({
    sourceSessionDate: SESSION,
    qualificationEvidenceKind: "live_market",
    supplementalLabels: [],
  });
  assertEquals(w.validFromSessionDate, SESSION);
  assertEquals(w.validThroughSessionDate, SESSION);
});

Deno.test("batch226 penny valid window next session carry", () => {
  const w = computePennyHandoffValidWindow({
    sourceSessionDate: SESSION,
    qualificationEvidenceKind: "prior_session_capture",
    supplementalLabels: ["next_session_carry"],
  });
  assertEquals(w.validFromSessionDate, NEXT);
  assertEquals(w.validThroughSessionDate, NEXT);
});

Deno.test("batch226 build upsert row requires idempotency and generation", () => {
  const row = buildPennyContinuationHandoffUpsertRow(qualifiedHandoff(), {
    observationGenerationId: "gen-a",
    generationSyncMs: 1_700_000_000_000,
    generationSyncIso: new Date(1_700_000_000_000).toISOString(),
  });
  assert(row);
  assertEquals(row!.symbol, "PNY");
  assertEquals(row!.publication_idempotency_key.includes("gen-a"), true);
  assertEquals(row!.generation_sync_ms, 1_700_000_000_000);
});

Deno.test("batch226 build upsert rejects missing generation metadata", () => {
  const row = buildPennyContinuationHandoffUpsertRow(qualifiedHandoff(), {
    observationGenerationId: "gen-a",
    generationSyncMs: Number.NaN,
    generationSyncIso: "bad",
  });
  assertEquals(row, null);
});

Deno.test("batch226 built upsert row passes bridge validation", () => {
  const row = buildPennyContinuationHandoffUpsertRow(qualifiedHandoff(), {
    observationGenerationId: "gen-a",
    generationSyncMs: 1_700_000_000_000,
    generationSyncIso: new Date(1_700_000_000_000).toISOString(),
  });
  assert(row);
  assert(validatePennyHandoffUpsertPayload(row as unknown as Record<string, unknown>));
});

Deno.test("batch226 read pairs reject empty and duplicates", () => {
  assertEquals(normalizePennyHandoffReadPairs([]), null);
  assertEquals(
    normalizePennyHandoffReadPairs([
      { symbol: "PNY", source_session_date: SESSION },
      { symbol: "PNY", source_session_date: SESSION },
    ]),
    null,
  );
  const ok = normalizePennyHandoffReadPairs([
    { symbol: "pny", source_session_date: SESSION },
  ]);
  assertEquals(ok?.[0].symbol, "PNY");
});

Deno.test("batch226 bundle projects only qualified rows", () => {
  const good = qualifiedHandoff();
  const bad = qualifiedHandoff({
    continuationQualified: false,
    badge: null,
  });
  const rows = buildPennyContinuationHandoffUpsertRowsFromBundle(
    {
      handoff_version: "penny_continuation_workflow_handoff_v1",
      integration_version: "penny_continuation_integration_v1",
      model_version: "penny_continuation_v1",
      sourceSessionDate: SESSION,
      captureIso: good.captureIso,
      handoffs: [good, bad],
    },
    {
      observationGenerationId: "gen-a",
      generationSyncMs: 1_700_000_000_000,
      generationSyncIso: new Date(1_700_000_000_000).toISOString(),
    },
  );
  assertEquals(rows.length, 1);
});
