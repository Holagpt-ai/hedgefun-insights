import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAuthoritativeDayTradeDesk } from "@/features/day-trade-radar-v2/day-trade-desk";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import { DEFAULT_EXECUTION_MODE } from "@/lib/execution/execution-mode";
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import {
  clearPaperTraderState,
  loadPaperTraderState,
  savePaperTraderState,
} from "@/lib/execution/runtime/paper-trader-persistence";
import { stocksistSignalsFromRadarRows } from "@/lib/execution/signal/ingest-radar-signals";
import { useScreenerData } from "@/hooks/useScreenerData";
import type { ScreenerResultRow } from "@/hooks/useScreenerData";

const RADAR_POLL_MS = 30_000;

function radarRowsFromScreener(rows: readonly ScreenerResultRow[]): RadarRankedRow[] {
  return rows as unknown as RadarRankedRow[];
}

export function usePaperTraderDashboard() {
  const persisted = useMemo(() => (typeof localStorage !== "undefined" ? loadPaperTraderState() : null), []);
  const sessionRef = useRef<PaperTraderSession>(
    new PaperTraderSession({
      startingCash: persisted?.startingCash ?? 100_000,
      mode: persisted?.mode ?? DEFAULT_EXECUTION_MODE,
      executionEnabled: persisted?.executionEnabled ?? false,
      persisted,
    }),
  );
  const [tick, setTick] = useState(0);
  const [mode, setModeState] = useState<ExecutionMode>(sessionRef.current.getMode());
  const [executionEnabled, setExecutionEnabledState] = useState(sessionRef.current.isExecutionEnabled());

  const { rows, status: screenerStatus } = useScreenerData("day_trade_radar", {
    refreshIntervalMs: RADAR_POLL_MS,
    pauseWhenHidden: true,
  });

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const persist = useCallback(() => {
    savePaperTraderState(sessionRef.current.exportPersistedState());
  }, []);

  const setMode = useCallback(
    (next: ExecutionMode) => {
      if (next === "live_confirm" || next === "live_autonomous") return;
      sessionRef.current.setMode(next);
      setModeState(next);
      persist();
      bump();
    },
    [bump, persist],
  );

  const setExecutionEnabled = useCallback(
    (enabled: boolean) => {
      sessionRef.current.setExecutionEnabled(enabled);
      setExecutionEnabledState(enabled);
      persist();
      bump();
    },
    [bump, persist],
  );

  const resetSession = useCallback(() => {
    sessionRef.current = new PaperTraderSession({ startingCash: 100_000 });
    clearPaperTraderState();
    setModeState(DEFAULT_EXECUTION_MODE);
    setExecutionEnabledState(false);
    bump();
  }, [bump]);

  const activateKillSwitch = useCallback(() => {
    sessionRef.current.killSwitchStore.activate({
      scope: "GLOBAL",
      strategyId: null,
      symbol: null,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "operator",
    });
    persist();
    bump();
  }, [bump, persist]);

  useEffect(() => {
    if (screenerStatus !== "available" || rows.length === 0) return;
    const ranked = radarRowsFromScreener(rows);
    const desk = buildAuthoritativeDayTradeDesk(ranked, Date.now());
    const candidates = [...desk.topOpportunities, ...ranked.slice(0, 40)];
    const signals = stocksistSignalsFromRadarRows(candidates);

    let cancelled = false;
    void (async () => {
      let changed = false;
      for (const signal of signals) {
        if (cancelled || sessionRef.current.hasSeenSignal(signal.id)) continue;
        const record = await sessionRef.current.processSignal(signal);
        if (record) changed = true;
      }
      if (changed && !cancelled) {
        persist();
        bump();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, screenerStatus, persist, bump]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session.getAccount().openPositions.length === 0) return;
    const prices: Record<string, number> = {};
    for (const row of rows) {
      const sym = row.symbol?.trim().toUpperCase();
      const px = row.price;
      if (sym && px != null && Number.isFinite(px)) prices[sym] = px;
    }
    if (Object.keys(prices).length === 0) return;
    void session.processPriceTick(prices).then(() => {
      persist();
      bump();
    });
  }, [rows, persist, bump]);

  const session = sessionRef.current;
  return {
    session,
    mode,
    executionEnabled,
    setMode,
    setExecutionEnabled,
    resetSession,
    activateKillSwitch,
    screenerStatus,
    tick,
    bump,
    persist,
  };
}
