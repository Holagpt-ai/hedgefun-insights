import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchScreenerFeedState } from "@/lib/screeners/screener-feed-fetch";
import {
  loadVerifiedScreenerGeneration,
  MAX_ROWS_FETCH,
  msUntilStaleTransition,
  unavailableView,
  validateGeneration,
  viewForActiveTab,
  type ScreenerFeedState,
  type ScreenerResultRow,
  type ScreenerTabView,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import { isRadarV2BackedTab } from "@/lib/screeners/radar-v2-adapter";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";
import { resolveRadarBackedScreenerLoad } from "@/lib/screeners/radar-v2-screener-load";
import { fetchRadarV22BoardDisplayDonors } from "@/lib/screeners/radar-v22-board-enrichment";
import {
  radarV2FetchThrewDecision,
} from "@/lib/screeners/radar-v2-soft-refresh";
import {
  peekRadarV2LoadDiagnostic,
  type RadarV2LoadDiagnostic,
} from "@/lib/screeners/radar-v2-diagnostics";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import {
  resolveScreenerTruthState,
  type ScreenerTruthState,
} from "@/lib/screeners/screener-truth-state";
import type { TabEvaluationEvidenceMap } from "@/lib/screeners/tab-evaluation-evidence";
import type { NhlBaselineStatus } from "@/lib/screeners/contract";

export type { ScreenerResultRow, ScreenerUiStatus };

const ROW_SELECT = [
  "tab_id",
  "symbol",
  "company_name",
  "price",
  "change_percent",
  "volume",
  "avg_volume",
  "rvol",
  "float_shares",
  "gap_percent",
  "high_52w",
  "low_52w",
  "market_cap",
  "prior_session_volume",
  "volume_ratio_prior_session",
  "day_high",
  "day_low",
  "range_event",
  "provider_as_of",
  "sync_run_id",
  "updated_at",
].join(",");

function filterCanonicalFieldDonors(
  rows: readonly ScreenerResultRow[] | null | undefined,
): ScreenerResultRow[] {
  if (!rows?.length) return [];
  return rows.filter(
    (row) =>
      row.change_percent !== null ||
      (row.prior_session_volume !== null && row.volume_ratio_prior_session !== null),
  );
}

async function loadRadarEnrichmentContext(
  tabId: string,
  nowMs: number,
): Promise<{ tabView: ScreenerTabView | null; allRows: ScreenerResultRow[] } | null> {
  const fetched = await fetchGenerationOnce();
  if (fetched.resultError || !fetched.resultRows?.length) return null;

  const donorRows = filterCanonicalFieldDonors(fetched.resultRows);
  if (fetched.stateError) {
    return donorRows.length > 0 ? { tabView: null, allRows: donorRows } : null;
  }

  const outcome = validateGeneration(fetched.stateRows, fetched.resultRows, nowMs);
  if (!outcome.ok) {
    return donorRows.length > 0 ? { tabView: null, allRows: donorRows } : null;
  }

  return {
    tabView: viewForActiveTab(outcome.generation, tabId, nowMs, 1),
    allRows: outcome.generation.rows,
  };
}

async function fetchGenerationOnce() {
  const [stateRes, rowsRes] = await Promise.all([
    fetchScreenerFeedState(),
    supabase
      .from("screener_results")
      .select(ROW_SELECT)
      .in("tab_id", [
        "day_trade_radar",
        "gappers",
        "volume_spikes",
        "gainers_losers",
        "unusual_volume",
        "new_highs_lows",
      ])
      .order("tab_id", { ascending: true })
      .order("volume", { ascending: false })
      .order("symbol", { ascending: true })
      .limit(MAX_ROWS_FETCH),
  ]);

  return {
    stateRows: stateRes.stateRows,
    resultRows: (rowsRes.data ?? null) as unknown as ScreenerResultRow[] | null,
    stateError: stateRes.stateError,
    resultError: rowsRes.error,
  };
}

export interface UseScreenerDataOptions {
  /**
   * Optional background refresh interval (ms). Only Day Trade Radar enables this.
   * Other tabs keep the default one-shot load.
   */
  refreshIntervalMs?: number;
  /** When true (default), pause polling while the document is hidden. */
  pauseWhenHidden?: boolean;
}

export function useScreenerData(
  tabId: string,
  options: UseScreenerDataOptions = {},
) {
  const { refreshIntervalMs, pauseWhenHidden = true } = options;
  const [status, setStatus] = useState<ScreenerUiStatus>("loading");
  const [rows, setRows] = useState<ScreenerResultRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [providerAsOfMax, setProviderAsOfMax] = useState<string | null>(null);
  // Which source is currently populating the tab, so the UI can show truthful,
  // session-aware copy (Radar V2 vs the verified screener_results path).
  const [source, setSource] = useState<ScreenerDataSource | null>(null);
  const [session, setSession] = useState<string | null>(null);
  // Snapshot of the existing load diagnostic after each Radar V2 attempt.
  // Used only by the opt-in `?radarDebug=1` surface — not a second decision path.
  const [radarDiagnostic, setRadarDiagnostic] = useState<RadarV2LoadDiagnostic | null>(null);
  const [truthState, setTruthState] = useState<ScreenerTruthState | null>(null);
  const [nhlBaselineStatus, setNhlBaselineStatus] = useState<NhlBaselineStatus | null>(null);
  const [tabEvaluationEvidence, setTabEvaluationEvidence] =
    useState<TabEvaluationEvidenceMap | null>(null);

  useEffect(() => {
    if (!tabId) return;
    let cancelled = false;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let hasLoadedOnce = false;
    let lastVerifiedRadar: RadarV2Decision | null = null;
    const lastViewRef = { current: null as ScreenerTabView | null };
    const lastSourceRef = { current: null as ScreenerDataSource | null };

    const clearStaleTimer = () => {
      if (staleTimer !== null) {
        clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const applyView = (
      view: ScreenerTabView,
      soft: boolean,
      resolvedSource: ScreenerDataSource | null = null,
    ) => {
      if (cancelled) return;
      // Never wipe rows on a failed background refresh.
      if (
        soft &&
        view.status === "unavailable" &&
        hasLoadedOnce
      ) {
        return;
      }
      setStatus(view.status);
      setNhlBaselineStatus(view.nhl_baseline_status ?? null);
      setTabEvaluationEvidence(view.tab_evaluation_evidence ?? null);
      lastViewRef.current = view;
      lastSourceRef.current = resolvedSource;
      setTruthState(
        resolveScreenerTruthState({
          tabId,
          status: view.status,
          rowCount: view.rows.length,
          syncedAt: view.synced_at,
          nhlBaselineStatus: view.nhl_baseline_status,
          tabEvaluationEvidence: view.tab_evaluation_evidence,
          source: resolvedSource,
        }),
      );
      if (
        view.status === "available" ||
        view.status === "stale" ||
        view.status === "empty" ||
        view.status === "initializing"
      ) {
        setRows(view.rows);
        setSyncedAt(view.synced_at);
        setProviderAsOfMax(view.provider_as_of_max);
        hasLoadedOnce = true;
      } else if (!soft) {
        setRows(view.rows);
        setSyncedAt(view.synced_at);
        setProviderAsOfMax(view.provider_as_of_max);
      }

      clearStaleTimer();
      if (
        (view.status === "available" || view.status === "empty") &&
        view.synced_at
      ) {
        const delay = msUntilStaleTransition(view.synced_at, Date.now());
        if (delay !== null) {
          staleTimer = setTimeout(() => {
            if (cancelled) return;
            const staleView = lastViewRef.current;
            if (!staleView) return;
            setStatus("stale");
            setTruthState(
              resolveScreenerTruthState({
                tabId,
                status: "stale",
                rowCount: staleView.rows.length,
                syncedAt: staleView.synced_at,
                nhlBaselineStatus: staleView.nhl_baseline_status,
                tabEvaluationEvidence: staleView.tab_evaluation_evidence,
                source: lastSourceRef.current,
              }),
            );
          }, delay);
        }
      }
    };

    const load = async (soft: boolean) => {
      if (!soft) {
        setStatus("loading");
        setRows([]);
        setSyncedAt(null);
        setProviderAsOfMax(null);
        setSource(null);
        setSession(null);
        setRadarDiagnostic(null);
        setTruthState(null);
        setNhlBaselineStatus(null);
        setTabEvaluationEvidence(null);
        hasLoadedOnce = false;
      }

      // Preferred source during an active Radar V2 session (pre-market, market,
      // after-hours): Radar V2 Sentinel. Transient poll failures must not
      // replace a verified Sentinel board with screener_results. Legacy rows
      // overlay confirmation on Day Trade Radar and render as the board only
      // when Radar V2 is genuinely unavailable.
      if (isRadarV2BackedTab(tabId)) {
        let radarDecision: RadarV2Decision;
        try {
          radarDecision = await loadRadarV2Decision(tabId, Date.now());
        } catch {
          radarDecision = radarV2FetchThrewDecision();
        }

        if (!cancelled) {
          setRadarDiagnostic(peekRadarV2LoadDiagnostic());
        }

        const resolved = resolveRadarBackedScreenerLoad({
          tabId,
          soft,
          priorRadar: lastVerifiedRadar,
          radarDecision,
          legacyView: null,
        });

        if (resolved.preserve) return;

        if (resolved.source === "radar-v2" && resolved.view) {
          let view = resolved.view;
          if (isRadarV2BackedTab(tabId)) {
            try {
              const nowMs = Date.now();
              const [enrichmentContext, boardRows] = await Promise.all([
                loadRadarEnrichmentContext(tabId, nowMs),
                fetchRadarV22BoardDisplayDonors(),
              ]);
              const withOverlay = resolveRadarBackedScreenerLoad({
                tabId,
                soft,
                priorRadar: lastVerifiedRadar,
                radarDecision,
                legacyView: enrichmentContext?.tabView ?? null,
                enrichmentRows: enrichmentContext?.allRows ?? null,
                boardRows,
              });
              if (withOverlay.source === "radar-v2" && withOverlay.view) {
                view = withOverlay.view;
              }
            } catch {
              // Overlay is optional. A failed legacy read must not drop Sentinel.
            }
          }
          lastVerifiedRadar = resolved.nextPriorRadar;
          if (!cancelled) {
            setSource("radar-v2");
            setSession(resolved.session);
          }
          applyView(view, soft, "radar-v2");
          return;
        }

        lastVerifiedRadar = null;
      }

      const view: ScreenerTabView = await loadVerifiedScreenerGeneration(
        fetchGenerationOnce,
        { nowMs: Date.now(), activeTabId: tabId },
      );
      const skipSoftUnavailable = soft && view.status === "unavailable" && hasLoadedOnce;
      if (!cancelled && !skipSoftUnavailable) {
        setSource("screener-results");
        setSession(null);
      }
      applyView(view, soft, "screener-results");
    };

    void load(false);

    if (
      typeof refreshIntervalMs === "number" &&
      refreshIntervalMs > 0
    ) {
      pollTimer = setInterval(() => {
        if (cancelled) return;
        if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
          return;
        }
        void load(true);
      }, refreshIntervalMs);
    }

    return () => {
      cancelled = true;
      clearStaleTimer();
      if (pollTimer !== null) clearInterval(pollTimer);
    };
  }, [tabId, refreshIntervalMs, pauseWhenHidden]);

  return {
    status,
    rows,
    syncedAt,
    providerAsOfMax,
    source,
    session,
    radarDiagnostic,
    truthState,
    nhlBaselineStatus,
    tabEvaluationEvidence,
  };
}
