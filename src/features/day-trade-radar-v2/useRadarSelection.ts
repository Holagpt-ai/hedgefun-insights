import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { TraderLensPresetId, TraderLensPriceBounds } from "@/config/scanner-presets.config";
import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import { applySignals, isRadarRowAccessible, rankRadarRows, signalForRank } from "./radar-metrics";
import {
  INITIAL_RADAR_SELECTION,
  radarSelectionReducer,
} from "./radar-selection";
import {
  applyTraderLensFilter,
  isBroadTraderLens,
  visibleTopLeaderRow,
} from "./trader-lens";
import { applyScreenerRowFilters } from "@/lib/screeners/screener-filters";
import type { ScreenerFilterSet } from "@/types/screener-filters";
import type { RadarRankedRow } from "./types";

export function useRadarSelection(opts: {
  rows: ScreenerResultRow[];
  status: ScreenerUiStatus;
  isPro: boolean;
  freeRowLimit: number;
  traderLensPresetId: TraderLensPresetId;
  traderLensBounds: TraderLensPriceBounds;
  screenerFilterSet?: ScreenerFilterSet;
}) {
  const {
    rows,
    status,
    isPro,
    freeRowLimit,
    traderLensPresetId,
    traderLensBounds,
    screenerFilterSet,
  } = opts;
  const [selection, dispatch] = useReducer(
    radarSelectionReducer,
    INITIAL_RADAR_SELECTION,
  );

  const board = useMemo(() => rankRadarRows(rows, status), [rows, status]);

  const ranked = useMemo(
    () =>
      applySignals(
        board,
        status,
        selection.inactive ? selection.selectedSymbol : null,
      ),
    [board, status, selection.inactive, selection.selectedSymbol],
  );

  const lens = useMemo(
    () => applyTraderLensFilter(ranked, traderLensPresetId, traderLensBounds),
    [ranked, traderLensPresetId, traderLensBounds],
  );

  const filtered = useMemo(() => {
    if (!screenerFilterSet || screenerFilterSet.filters.length === 0) return lens.rows;
    return applyScreenerRowFilters(lens.rows, screenerFilterSet, (row) => row.rank);
  }, [lens.rows, screenerFilterSet]);

  const visibleTopLeader = useMemo(
    () => visibleTopLeaderRow(ranked, filtered, traderLensBounds),
    [ranked, filtered, traderLensBounds],
  );

  const lensConstrained = !isBroadTraderLens(traderLensBounds);

  useEffect(() => {
    if (status === "loading") return;
    dispatch({
      type: "board_updated",
      rows: board,
      topLeader: visibleTopLeader,
      lensConstrained,
    });
  }, [board, status, visibleTopLeader, lensConstrained]);

  const selectRow = useCallback(
    (row: RadarRankedRow) => {
      if (!isRadarRowAccessible(row.rank, isPro, freeRowLimit)) return;
      dispatch({ type: "select_manual", row });
    },
    [isPro, freeRowLimit],
  );

  const followLeader = useCallback(() => {
    dispatch({
      type: "follow_leader",
      rows: board,
      topLeader: visibleTopLeader,
      lensConstrained,
    });
  }, [board, visibleTopLeader, lensConstrained]);

  const returnToLeader = useCallback(() => {
    dispatch({
      type: "return_to_leader",
      rows: board,
      topLeader: visibleTopLeader,
      lensConstrained,
    });
  }, [board, visibleTopLeader, lensConstrained]);

  const activeRow: RadarRankedRow | null = useMemo(() => {
    if (!selection.snapshot) return null;
    if (selection.inactive) {
      return { ...selection.snapshot, signal: "INACTIVE" };
    }
    const live = board.find((r) => r.symbol === selection.selectedSymbol);
    return live
      ? {
          ...live,
          signal: signalForRank(live.rank, status, false, live.signal_status),
        }
      : selection.snapshot;
  }, [selection, board, status]);

  return {
    ranked,
    filtered,
    visibleTopLeader,
    lens,
    selection,
    activeRow,
    selectRow,
    followLeader,
    returnToLeader,
    followingLeader: selection.mode === "follow_leader",
  };
}
