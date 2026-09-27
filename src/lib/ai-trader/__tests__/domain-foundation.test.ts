import { describe, expect, it } from "vitest";
import { accountRecordContainsSecretKey } from "@/lib/ai-trader/domain/accounts";
import { auditPayloadContainsForbiddenKey } from "@/lib/ai-trader/domain/audit";
import { hashContextSnapshot } from "@/lib/ai-trader/domain/context";
import {
  POSITION_DECISION_ACTIONS,
  positionActionIncreasesUnauthorizedRisk,
} from "@/lib/ai-trader/domain/decisions";
import {
  isLearnedBelief,
  isObservation,
  learnedBeliefHasRequiredEvidence,
  type AiTraderLearnedBelief,
  type AiTraderObservation,
} from "@/lib/ai-trader/domain/memory";
import { AI_TRADER_SELECTED_MODEL_ASSIGNMENT } from "@/lib/ai-trader/domain/models";
import { processQualityFrom } from "@/lib/ai-trader/domain/reflections";
import { rewardIsNotProcessQuality } from "@/lib/ai-trader/domain/rewards";
import { canAiWriteStrategyStatus, strategyMayRunInMode } from "@/lib/ai-trader/domain/strategies";
import { EMPTY_MODEL_REGISTRY } from "@/lib/ai-trader/providers/reasoning-provider";
import { canAiWriteCandidateStatus } from "@/lib/ai-trader/domain/reflections";

const instrument = { symbol: "AMC", assetClass: "US_EQUITY" as const, venue: null };

const observation: AiTraderObservation = {
  kind: "OBSERVATION",
  id: "obs_1",
  instrument,
  observedAt: "2026-09-01T13:30:00.000Z",
  observationType: "beta",
  value: { beta: 1.3 },
  provenance: {
    source: "stocks",
    sourceType: "column",
    sourceId: "AMC",
    sourceTimestamp: "2026-09-01T13:30:00.000Z",
    retrievedAt: "2026-09-01T13:30:00.000Z",
    verificationState: "UNVERIFIED",
  },
  qualityScore: null,
};

const belief: AiTraderLearnedBelief = {
  kind: "LEARNED_BELIEF",
  profileVersion: "v1",
  lookbackWindow: "20d",
  sampleSize: 8,
  confidence: 0.4,
  evidenceObservationIds: ["obs_1"],
  behaviorSummary: "Recently elevated opening range.",
  derivedMetrics: {},
  isCurrent: true,
  supersedesId: null,
  updatedAt: "2026-09-01T20:00:00.000Z",
};

describe("AI Trader domain foundation", () => {
  it("keeps observation and learned belief as distinct records", () => {
    expect(isObservation(observation)).toBe(true);
    expect(isLearnedBelief(observation)).toBe(false);
    expect(isLearnedBelief(belief)).toBe(true);
    expect(isObservation(belief)).toBe(false);
    expect(learnedBeliefHasRequiredEvidence(belief)).toBe(true);
    expect(
      learnedBeliefHasRequiredEvidence({
        ...belief,
        sampleSize: 0,
        evidenceObservationIds: [],
      }),
    ).toBe(false);
  });

  it("does not treat profit as process quality", () => {
    expect(processQualityFrom(true, false)).toBe("GOOD_PROCESS_BAD_OUTCOME");
    expect(processQualityFrom(false, true)).toBe("BAD_PROCESS_GOOD_OUTCOME");
    expect(
      rewardIsNotProcessQuality({
        id: "rwd_1",
        tradeId: "trd_1",
        decisionId: null,
        reflectionId: null,
        processQuality: "BAD_PROCESS_GOOD_OUTCOME",
        dimensions: { NET_PNL: 400 },
        notes: null,
        createdAt: "2026-09-01T20:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("blocks AI from writing live strategy or candidate statuses", () => {
    expect(canAiWriteStrategyStatus("PROPOSED")).toBe(true);
    expect(canAiWriteStrategyStatus("APPROVED_CONTROLLED_LIVE")).toBe(false);
    expect(canAiWriteCandidateStatus("PROPOSED")).toBe(true);
    expect(canAiWriteCandidateStatus("APPROVED_CONTROLLED_LIVE")).toBe(false);
    expect(
      strategyMayRunInMode(
        {
          status: "PROPOSED",
          allowedModes: ["CONTROLLED_LIVE"],
          approvedBy: null,
        },
        "CONTROLLED_LIVE",
      ),
    ).toBe(false);
  });

  it("selects no model and resolves no registry assignment", () => {
    expect(AI_TRADER_SELECTED_MODEL_ASSIGNMENT).toBeNull();
    expect(EMPTY_MODEL_REGISTRY.resolve("RESEARCH_MODEL", "2026-09-27")).toBeNull();
  });

  it("hashes context snapshots stably and without raw reasoning", () => {
    const base = {
      tradingSessionId: null,
      instrument,
      observedAt: "2026-09-01T13:31:00.000Z",
      marketSession: "REGULAR",
      operatingMode: "OFF" as const,
      quoteTimestamp: "2026-09-01T13:31:00.000Z",
      marketState: { last: 2.51 },
      stocksistSignals: { rvol_5m: null },
      catalystRefs: [],
      historicalRefs: [],
      sourceProvenance: [],
      schemaVersion: "v1",
    };
    expect(hashContextSnapshot(base)).toBe(hashContextSnapshot({ ...base }));
    expect(hashContextSnapshot({ ...base, marketState: { last: 2.52 } })).not.toBe(hashContextSnapshot(base));
    expect(auditPayloadContainsForbiddenKey({ decision: "PASS" })).toBe(false);
    expect(auditPayloadContainsForbiddenKey({ chainOfThought: "hidden" })).toBe(true);
    expect(accountRecordContainsSecretKey({ accountId: "acct_1", apiKey: "x" })).toBe(true);
  });

  it("keeps position proposals from increasing unauthorized risk", () => {
    for (const action of POSITION_DECISION_ACTIONS) {
      expect(positionActionIncreasesUnauthorizedRisk(action)).toBe(false);
    }
    expect(positionActionIncreasesUnauthorizedRisk("WIDEN_STOP")).toBe(true);
  });
});
