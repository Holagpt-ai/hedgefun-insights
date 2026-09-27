import type { MarketIntelligenceAdapter } from "@/lib/ai-trader/market/intelligence-adapter";
import { filterEligibleCandidates } from "@/lib/ai-trader/market/candidate-filter";
import { candidatesPreserveSourceRank, type MarketCandidate } from "@/lib/ai-trader/market/candidate";
import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import { applyCooldownExpiry } from "@/lib/ai-trader/runtime/aging";
import { buildCandidateContextSnapshot } from "@/lib/ai-trader/runtime/context-builder";
import type { ShadowCycleError, ShadowCycleResult } from "@/lib/ai-trader/runtime/contracts";
import { isClosedMarketSession, type AiTraderMarketSession } from "@/lib/ai-trader/runtime/contracts";
import { assessCandidateFreshness } from "@/lib/ai-trader/runtime/freshness";
import { emptyShadowHeartbeat } from "@/lib/ai-trader/runtime/heartbeat";
import { createSilentShadowLogger, type ShadowRuntimeLogger } from "@/lib/ai-trader/runtime/logger";
import { resolveAiTraderMarketSession, resolveSurveillanceDate } from "@/lib/ai-trader/runtime/market-session-policy";
import { observationSourceEventKey, buildRealObservations } from "@/lib/ai-trader/runtime/observation-builder";
import { observationRuntimePermitted, offCycleSkipResult } from "@/lib/ai-trader/runtime/operating-mode-gate";
import { MemoryPersistenceError } from "@/lib/ai-trader/persistence/executor";
import { SHADOW_OBSERVATION_POLICY } from "@/lib/ai-trader/runtime/observation-policy";
import type { ShadowPersistence, ShadowWatchlistChangeRequest } from "@/lib/ai-trader/runtime/shadow-persistence";
import { proposeShadowWatchlistChanges } from "@/lib/ai-trader/runtime/watchlist-policy";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

export interface ShadowRuntimeDeps {
  readOperatingMode: () => Promise<AiTraderOperatingMode>;
  marketAdapter: MarketIntelligenceAdapter;
  persistence: ShadowPersistence;
  now?: () => Date;
  resolveSession?: (nowMs: number) => AiTraderMarketSession;
  logger?: ShadowRuntimeLogger;
  workerId?: string;
}

function sourceObservationIdentity(proposal: WatchlistProposal): string {
  const ref = proposal.marketEvidenceRefs[0];
  if (ref && typeof ref === "object") {
    const row = ref as Record<string, unknown>;
    return [row.table, row.generationId, row.sourceRank].filter((part) => part != null && part !== "").join(":");
  }
  return `${proposal.source}:${proposal.sourceRank}`;
}

function emptyResult(cycleId: string, status: ShadowCycleResult["status"], reason?: string): ShadowCycleResult {
  return {
    status,
    reason,
    cycleId,
    observedCandidateCount: 0,
    eligibleCandidateCount: 0,
    discoveredCount: 0,
    transitionedCount: 0,
    removedCount: 0,
    contextSnapshotsWritten: 0,
    observationsWritten: 0,
    errors: [],
  };
}

export function createAiTraderShadowRuntime(deps: ShadowRuntimeDeps) {
  const logger = deps.logger ?? createSilentShadowLogger();
  const heartbeat = emptyShadowHeartbeat(deps.workerId ?? "shadow-runtime");

  return {
    heartbeat,
    async runCycle(): Promise<ShadowCycleResult> {
      const started = (deps.now ?? (() => new Date()))();
      const cycleId = `cycle-${started.toISOString()}`;
      heartbeat.lastCycleStart = started.toISOString();
      const errors: ShadowCycleError[] = [];

      let mode: AiTraderOperatingMode;
      try {
        mode = await deps.readOperatingMode();
      } catch (error) {
        const failed = emptyResult(cycleId, "FAILED", "OPERATING_MODE_UNAVAILABLE");
        failed.errors = [{ scope: "SYSTEMIC", code: "OPERATING_MODE_UNAVAILABLE", message: String(error) }];
        heartbeat.lastError = failed.reason ?? "FAILED";
        return failed;
      }

      heartbeat.mode = mode;
      const offReason = offCycleSkipResult(mode);
      if (offReason) {
        const skipped = emptyResult(cycleId, "SKIPPED", offReason);
        logger.info("shadow_cycle_skipped", { cycleId, mode, reason: offReason });
        heartbeat.lastCycleCompletion = new Date().toISOString();
        return skipped;
      }
      if (!observationRuntimePermitted(mode)) {
        return emptyResult(cycleId, "SKIPPED", `OPERATING_MODE_${mode}`);
      }

      const nowMs = started.getTime();
      let session: AiTraderMarketSession;
      try {
        session = (deps.resolveSession ?? resolveAiTraderMarketSession)(nowMs);
      } catch (error) {
        return {
          ...emptyResult(cycleId, "FAILED", "SESSION_POLICY_UNAVAILABLE"),
          errors: [{ scope: "SYSTEMIC", code: "SESSION_POLICY_UNAVAILABLE", message: String(error) }],
        };
      }
      heartbeat.session = session;
      const surveillanceDate = resolveSurveillanceDate(nowMs);

      let board: readonly MarketCandidate[];
      try {
        if (isClosedMarketSession(session)) {
          board = [];
        } else {
          board = await deps.marketAdapter.getCandidateBoard({
            asOfMs: nowMs,
            todayEt: surveillanceDate ?? started.toISOString().slice(0, 10),
          });
        }
      } catch (error) {
        const failed = emptyResult(cycleId, "FAILED", "MARKET_ADAPTER_UNAVAILABLE");
        failed.errors = [{ scope: "SYSTEMIC", code: "MARKET_ADAPTER_UNAVAILABLE", message: String(error) }];
        heartbeat.lastError = failed.reason ?? "FAILED";
        return failed;
      }

      if (!candidatesPreserveSourceRank(board)) {
        return {
          ...emptyResult(cycleId, "FAILED", "SOURCE_RANK_REORDERED"),
          observedCandidateCount: board.length,
          errors: [{ scope: "SYSTEMIC", code: "SOURCE_RANK_REORDERED", message: "Radar order was mutated" }],
        };
      }

      const eligible: MarketCandidate[] = [];
      for (const candidate of filterEligibleCandidates(board)) {
        try {
          const freshness = assessCandidateFreshness(candidate, nowMs, surveillanceDate);
          if (freshness) {
            errors.push({
              scope: "CANDIDATE",
              symbol: candidate.symbol,
              code: freshness,
              message: freshness,
            });
            continue;
          }
          eligible.push(candidate);
        } catch (error) {
          errors.push({
            scope: "CANDIDATE",
            symbol: candidate.symbol,
            code: "MALFORMED_CANDIDATE",
            message: String(error),
          });
        }
      }

      let existing;
      try {
        existing = await deps.persistence.listWatchlistItems();
      } catch (error) {
        return {
          ...emptyResult(cycleId, "FAILED", "DATABASE_UNAVAILABLE"),
          observedCandidateCount: board.length,
          eligibleCandidateCount: eligible.length,
          errors: [{ scope: "SYSTEMIC", code: "DATABASE_UNAVAILABLE", message: String(error) }],
        };
      }

      const proposals = [
        ...proposeShadowWatchlistChanges(eligible, existing),
        ...applyCooldownExpiry(existing, nowMs),
      ];

      let discoveredCount = 0;
      let transitionedCount = 0;
      let removedCount = 0;
      let contextSnapshotsWritten = 0;
      let observationsWritten = 0;

      for (const proposal of proposals) {
        try {
          if (proposal.nextState === "COOLDOWN") {
            proposal.reasonCodes = [...proposal.reasonCodes];
          }
          const request: ShadowWatchlistChangeRequest = {
            ...proposal,
            cycleId,
            policyVersion: SHADOW_OBSERVATION_POLICY.version,
            sourceObservationIdentity: sourceObservationIdentity(proposal),
          };
          const result = await deps.persistence.persistWatchlistChange(request, started.toISOString());
          if (result === "unchanged" || result === "duplicate") continue;
          if (result === "conflict") {
            errors.push({
              scope: "CANDIDATE",
              symbol: proposal.symbol,
              code: "WATCHLIST_CONFLICT",
              message: "stale expected watchlist state",
            });
            continue;
          }
          transitionedCount += 1;
          if (proposal.nextState === "DISCOVERED" && proposal.priorState == null) discoveredCount += 1;
          if (proposal.nextState === "REMOVED") removedCount += 1;
        } catch (error) {
          if (error instanceof MemoryPersistenceError && error.code === "RPC_NOT_APPLIED") {
            return {
              ...emptyResult(cycleId, "FAILED", "TRANSITION_RPC_UNAVAILABLE"),
              observedCandidateCount: board.length,
              eligibleCandidateCount: eligible.length,
              errors: [{ scope: "SYSTEMIC", code: "TRANSITION_RPC_UNAVAILABLE", message: error.message }],
            };
          }
          errors.push({
            scope: "CANDIDATE",
            symbol: proposal.symbol,
            code: "WATCHLIST_WRITE_FAILED",
            message: String(error),
          });
        }
      }

      if (!isClosedMarketSession(session)) {
        for (const candidate of eligible) {
          try {
            const snapshot = buildCandidateContextSnapshot(candidate, {
              operatingMode: mode,
              marketSession: session,
              cycleNowMs: nowMs,
            });
            if (snapshot) {
              const written = await deps.persistence.upsertContextSnapshot({
                symbol: snapshot.instrument.symbol,
                observedAt: snapshot.observedAt,
                marketSession: snapshot.marketSession,
                operatingMode: snapshot.operatingMode,
                contextHash: snapshot.contextHash,
                schemaVersion: snapshot.schemaVersion,
                marketState: snapshot.marketState,
                stocksistSignals: snapshot.stocksistSignals,
                catalystRefs: snapshot.catalystRefs,
                historicalRefs: snapshot.historicalRefs,
                sourceProvenance: snapshot.sourceProvenance,
                quoteTimestamp: snapshot.quoteTimestamp,
              });
              if (written === "inserted") contextSnapshotsWritten += 1;
            }
            for (const observation of buildRealObservations(candidate, session)) {
              const recorded = await deps.persistence.recordObservation(
                observation,
                observationSourceEventKey(observation),
              );
              if (recorded === "inserted") observationsWritten += 1;
            }
          } catch (error) {
            errors.push({
              scope: "CANDIDATE",
              symbol: candidate.symbol,
              code: "CANDIDATE_PERSIST_FAILED",
              message: String(error),
            });
          }
        }
      }

      const result: ShadowCycleResult = {
        status: "COMPLETED",
        cycleId,
        observedCandidateCount: board.length,
        eligibleCandidateCount: eligible.length,
        discoveredCount,
        transitionedCount,
        removedCount,
        contextSnapshotsWritten,
        observationsWritten,
        errors,
      };
      logger.info("shadow_cycle_completed", {
        cycleId,
        mode,
        session,
        observedCandidateCount: result.observedCandidateCount,
        eligibleCandidateCount: result.eligibleCandidateCount,
        transitionedCount,
        contextSnapshotsWritten,
        observationsWritten,
        durationMs: Date.now() - nowMs,
      });
      heartbeat.lastCycleCompletion = new Date().toISOString();
      heartbeat.lastSuccess = heartbeat.lastCycleCompletion;
      return result;
    },
  };
}
