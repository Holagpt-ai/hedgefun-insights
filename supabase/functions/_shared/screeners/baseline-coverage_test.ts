import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  parseStatePolicyExclusionFields,
  validatePolicyExclusionEvidence,
} from "./baseline-coverage.ts";

const GEN = "11111111-2222-3333-4444-555555555555";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    generation_id: GEN,
    symbol: "AAA",
    reason: "insufficient_sessions",
    sessions_observed: 40,
    min_sessions: 120,
    ...overrides,
  };
}

Deno.test("state policy fields: both present and valid", () => {
  const parsed = parseStatePolicyExclusionFields({
    policy_min_sessions: 120,
    policy_excluded_count: 3,
  });
  assertEquals(parsed, { min_sessions: 120, excluded_count: 3 });
});

Deno.test("state policy fields: nulls are unavailable", () => {
  assertEquals(
    parseStatePolicyExclusionFields({
      policy_min_sessions: null,
      policy_excluded_count: null,
    }),
    null,
  );
});

Deno.test("state policy fields: zero exclusions with min_sessions is valid", () => {
  const parsed = parseStatePolicyExclusionFields({
    policy_min_sessions: 120,
    policy_excluded_count: 0,
  });
  assertEquals(parsed, { min_sessions: 120, excluded_count: 0 });
});

Deno.test("exclusions: empty declared set is available", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 0,
    rows: [],
  });
  assertEquals(evidence.available, true);
  assertEquals(evidence.excluded_count, 0);
  assertEquals(evidence.min_sessions, 120);
  assertEquals(evidence.symbols.size, 0);
});

Deno.test("exclusions: valid insufficient_sessions row is accepted", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row()],
  });
  assertEquals(evidence.available, true);
  assertEquals(evidence.symbols.has("AAA"), true);
});

Deno.test("exclusions: count mismatch is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 2,
    rows: [row()],
  });
  assertEquals(evidence, POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE);
});

Deno.test("exclusions: generation mismatch is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ generation_id: "22222222-2222-3333-4444-555555555555" })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: unrecognized reason is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ reason: "unknown" })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: sessions_observed >= min_sessions is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ sessions_observed: 120 })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: row min_sessions mismatch vs state is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ min_sessions: 80 })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: invalid symbol is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ symbol: "aa" })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: duplicate symbols are unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 2,
    rows: [row(), row()],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: sessions_observed < 1 is unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: 120,
    policyExcludedCount: 1,
    rows: [row({ sessions_observed: 0 })],
  });
  assertEquals(evidence.available, false);
});

Deno.test("exclusions: missing state policy fields are unavailable", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: GEN,
    policyMinSessions: null,
    policyExcludedCount: null,
    rows: [],
  });
  assertEquals(evidence.available, false);
});
