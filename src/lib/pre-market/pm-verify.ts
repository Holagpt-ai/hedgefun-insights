/**
 * Opt-in Pre-Market live-verification diagnostics (`?pmDebug=1`).
 *
 * Observation only. Does not change Radar ranking, source precedence,
 * stale thresholds, generation acceptance, or fallback behavior.
 */

import { peekRadarV2LoadDiagnostic } from "@/lib/screeners/radar-v2-diagnostics";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { VolumeLeadersView } from "@/lib/screeners/radar-v2-volume-leaders";
import type {
  MarketContextStatus,
  PreMarketChecklistItem,
  PreMarketIndex,
  PreMarketWorkspaceResponse,
  SectionEnvelope,
} from "@/types/pre-market";

export const PM_DEBUG_QUERY_PARAM = "pmDebug";
export const PM_DEBUG_QUERY_VALUE = "1";
export const PM_VERIFY_PREFIX = "[PM-VERIFY]";

export const VOLUME_LEADERS_CHECKLIST_ID = "volume_leaders";
export const VOLUME_LEADERS_CHECKLIST_ROUTE = "/dashboard/screeners";

export function isPmDebugEnabled(
  search: string | URLSearchParams | null | undefined,
): boolean {
  if (!search) return false;
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  return params.get(PM_DEBUG_QUERY_PARAM) === PM_DEBUG_QUERY_VALUE;
}

export function emitPmVerify(
  enabled: boolean,
  topic: string,
  payload: Record<string, unknown>,
): void {
  if (!enabled) return;
  console.info(PM_VERIFY_PREFIX, topic, payload);
}

export function ageSeconds(iso: string | null | undefined, nowMs: number): number | null {
  const ms = parseTimestampMs(iso ?? null);
  if (ms === null) return null;
  return Math.round((nowMs - ms) / 1000);
}

export function newestIndexUpdatedAt(
  indexes: SectionEnvelope<PreMarketIndex[]> | null | undefined,
): string | null {
  if (!indexes?.data?.length) return null;
  let newest: string | null = null;
  for (const row of indexes.data) {
    if (row.status !== "available" || !row.updated_at) continue;
    if (!newest || row.updated_at > newest) newest = row.updated_at;
  }
  return newest;
}

export function sectionUsesLastKnownGood(
  section: SectionEnvelope<unknown> | null | undefined,
): boolean {
  return section?.status === "stale" && section.reason_code === "REFRESH_UNAVAILABLE";
}

/**
 * Polygon/workspace uses `premarket`. Radar Persistence V2 uses `pre-market`.
 * A mismatch is evidence only — callers must not rewrite either clock.
 */
export function isRadarSessionMismatch(
  polygonSession: MarketContextStatus | null | undefined,
  radarSession: string | null | undefined,
): boolean {
  if (polygonSession !== "premarket") return false;
  if (radarSession == null || radarSession === "") return false;
  return radarSession !== "pre-market";
}

export function volumeLeaderChecklistLabel(count: number): string {
  return `Review ${count} current Screener volume ${count === 1 ? "leader" : "leaders"}`;
}

/**
 * Align the Opening Bell volume-leaders item with the board the trader sees.
 * Confirmed pre-market uses the Radar Volume Leaders view. Legacy
 * screener_results counts are stripped so they cannot satisfy readiness.
 * Outside pre-market the workspace checklist is left unchanged.
 */
export function applyPresentedVolumeLeadersToChecklist(input: {
  premarketActive: boolean;
  items: readonly PreMarketChecklistItem[];
  volumeLeadersView: Pick<VolumeLeadersView, "source" | "section" | "loading">;
}): PreMarketChecklistItem[] {
  const items = input.items.map((item) => ({ ...item }));
  if (!input.premarketActive) return items;

  const withoutLegacy = items.filter((item) => item.id !== VOLUME_LEADERS_CHECKLIST_ID);
  if (input.volumeLeadersView.loading || input.volumeLeadersView.source == null) {
    return withoutLegacy;
  }
  if (input.volumeLeadersView.source === "unavailable") {
    return withoutLegacy;
  }

  const count = input.volumeLeadersView.section?.data.length ?? 0;
  if (!(count > 0)) return withoutLegacy;

  withoutLegacy.push({
    id: VOLUME_LEADERS_CHECKLIST_ID,
    count,
    label: volumeLeaderChecklistLabel(count),
    route: VOLUME_LEADERS_CHECKLIST_ROUTE,
  });
  return withoutLegacy;
}

export interface RadarObserveSnapshot {
  lastSuccessfulRefreshAt: string | null;
  preserved: boolean;
  preserveReason: string | null;
  previousGenerationId: string | null;
  preservedSyncedAt: string | null;
}

export const EMPTY_RADAR_OBSERVE: RadarObserveSnapshot = {
  lastSuccessfulRefreshAt: null,
  preserved: false,
  preserveReason: null,
  previousGenerationId: null,
  preservedSyncedAt: null,
};

export function generationIdFromDecision(decision: RadarV2Decision | null | undefined): string | null {
  const fromRow = decision?.view?.rows[0]?.sync_run_id;
  if (typeof fromRow === "string" && fromRow) return fromRow;
  return peekRadarV2LoadDiagnostic()?.generationId ?? null;
}

export function buildRadarVerifyState(input: {
  nowMs: number;
  polygonSession: MarketContextStatus | null | undefined;
  radarDecision: RadarV2Decision | null;
  volumeLeadersView: Pick<VolumeLeadersView, "source" | "section" | "loading">;
  observe: RadarObserveSnapshot;
}): Record<string, unknown> {
  const diagnostic = peekRadarV2LoadDiagnostic();
  const decision = input.radarDecision;
  const syncedAt =
    decision?.view?.synced_at ?? diagnostic?.v2SyncedAt ?? null;
  const lastReceiveAt = diagnostic?.lastReceiveAt ?? null;
  const qualifiedRowCount = decision?.view?.rows.length ?? 0;
  const displayedCount = input.volumeLeadersView.section?.data.length ?? 0;

  return {
    observedAt: new Date(input.nowMs).toISOString(),
    polygonSession: input.polygonSession ?? null,
    radarSession: decision?.session ?? diagnostic?.session ?? null,
    source: input.volumeLeadersView.source,
    decisionSource: decision?.source ?? null,
    reason: decision?.reason ?? diagnostic?.reason ?? null,
    generationId: generationIdFromDecision(decision),
    syncedAt,
    ageSeconds: ageSeconds(syncedAt, input.nowMs),
    lastReceiveAt,
    lastReceiveAgeSeconds: ageSeconds(lastReceiveAt, input.nowMs),
    attempts: diagnostic?.attempts ?? null,
    declaredCandidateCount: diagnostic?.declaredCandidateCount ?? null,
    candidateRowsRead: diagnostic?.candidateRowsRead ?? null,
    qualifiedRowCount,
    displayedVolumeLeaderCount: displayedCount,
    preserved: input.observe.preserved,
    preserveReason: input.observe.preserveReason,
    previousGenerationId: input.observe.previousGenerationId,
    lastSuccessfulRadarRefreshAt: input.observe.lastSuccessfulRefreshAt,
    lastSuccessfulRadarRefreshAgeSeconds: ageSeconds(
      input.observe.lastSuccessfulRefreshAt,
      input.nowMs,
    ),
    preservedBoardAgeSeconds: input.observe.preserved
      ? ageSeconds(input.observe.preservedSyncedAt, input.nowMs)
      : null,
    sessionMismatch: isRadarSessionMismatch(
      input.polygonSession,
      decision?.session ?? diagnostic?.session ?? null,
    ),
  };
}

export function buildFreshnessVerifyState(input: {
  nowMs: number;
  workspace: PreMarketWorkspaceResponse | null;
  workspaceStaleUpdateFailed: boolean;
  radarSyncedAt: string | null;
  radarLastReceiveAt: string | null;
  volumeLeadersSource: VolumeLeadersView["source"];
}): Record<string, unknown> {
  const newestIndex = newestIndexUpdatedAt(input.workspace?.indexes);
  return {
    observedAt: new Date(input.nowMs).toISOString(),
    serverNow: input.workspace?.server_now ?? null,
    serverNowAgeSeconds: ageSeconds(input.workspace?.server_now, input.nowMs),
    newestIndexUpdatedAt: newestIndex,
    newestIndexAgeSeconds: ageSeconds(newestIndex, input.nowMs),
    radarSyncedAt: input.radarSyncedAt,
    radarSyncedAgeSeconds: ageSeconds(input.radarSyncedAt, input.nowMs),
    radarLastReceiveAt: input.radarLastReceiveAt,
    radarLastReceiveAgeSeconds: ageSeconds(input.radarLastReceiveAt, input.nowMs),
    volumeLeadersSource: input.volumeLeadersSource,
    workspaceStaleUpdateFailed: input.workspaceStaleUpdateFailed,
    lastKnownGood: {
      workspace: input.workspaceStaleUpdateFailed,
      watchlistActivity: sectionUsesLastKnownGood(input.workspace?.watchlist_activity),
      headlines: sectionUsesLastKnownGood(input.workspace?.headlines),
    },
  };
}

export function httpStatusCategory(status: number | null | undefined): string | null {
  if (status == null || !Number.isFinite(status)) return null;
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

export interface AmBriefVerifyInput {
  kind: string;
  httpStatus: number | null;
  available?: boolean;
  reason?: string | null;
  generatedAt?: string | null;
  sourceCheckedAt?: string | null;
  briefDate?: string | null;
  previousTradingDay?: boolean | null;
  nowEtDate: string;
}

/**
 * Client-visible AM brief snapshot. `get-daily-brief` does not return
 * cached-vs-generated, so that field stays null.
 */
export function mapAmBriefVerifyState(input: AmBriefVerifyInput): Record<string, unknown> {
  return {
    briefType: "am",
    requestStatus: input.kind,
    available: input.kind === "available",
    notice: input.kind === "notice",
    error: input.kind === "error",
    reason: input.reason ?? null,
    generatedAt: input.generatedAt ?? null,
    sourceCheckedAt: input.sourceCheckedAt ?? null,
    briefDate: input.briefDate ?? null,
    previousTradingDay: input.previousTradingDay ?? null,
    isCurrentEtTradingDay:
      typeof input.briefDate === "string" && input.briefDate === input.nowEtDate,
    httpStatus: input.httpStatus,
    httpStatusCategory: httpStatusCategory(input.httpStatus),
    cachedVsGenerated: null,
    cachedVsGeneratedAvailable: false,
  };
}

export function buildSessionMismatchPayload(
  polygonSession: MarketContextStatus | null | undefined,
  radarSession: string | null | undefined,
): { polygonSession: MarketContextStatus | null; radarSession: string | null } {
  return {
    polygonSession: polygonSession ?? null,
    radarSession: radarSession ?? null,
  };
}
