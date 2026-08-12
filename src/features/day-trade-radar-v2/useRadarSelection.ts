import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import { applySignals, isRadarRowAccessible, rankRadarRows } from "./radar-metrics";
import {
  INITIAL_RADAR_SELECTION,
  radarSelectionReducer,
} from "./radar-selection";
import type { RadarRankedRow } from "./types";

export function useRadarSelection(opts: {
  rows: ScreenerResultRow[];
  status: ScreenerUiStatus;
  isPro: boolean;
  freeRowLimit: number;
}) {
  const { rows, status, isPro, freeRowLimit } = opts;
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

  useEffect(() => {
    if (status === "loading") return;
    dispatch({ type: "board_updated", rows: board });
  }, [board, status]);

  const selectRow = useCallback(
    (row: RadarRankedRow) => {
      if (!isRadarRowAccessible(row.rank, isPro, freeRowLimit)) return;
      dispatch({ type: "select_manual", row });
    },
    [isPro, freeRowLimit],
  );

  const followLeader = useCallback(() => {
    dispatch({ type: "follow_leader", rows: board });
  }, [board]);

  const returnToLeader = useCallback(() => {
    dispatch({ type: "return_to_leader", rows: board });
  }, [board]);

  const activeRow: RadarRankedRow | null = useMemo(() => {
    if (!selection.snapshot) return null;
    if (selection.inactive) {
      return { ...selection.snapshot, signal: "INACTIVE" };
    }
    const live = board.find((r) => r.symbol === selection.selectedSymbol);
    return live
      ? {
          ...live,
          signal: signalOverlay(live.rank, status),
        }
      : selection.snapshot;
  }, [selection, board, status]);

  return {
    ranked,
    selection,
    activeRow,
    selectRow,
    followLeader,
    returnToLeader,
    followingLeader: selection.mode === "follow_leader",
  };
}

function signalOverlay(
  rank: number,
  status: ScreenerUiStatus,
): RadarRankedRow["signal"] {
  if (status === "stale") return "STALE";
  if (rank === 1) return "TOP LEADER";
  return "VOLUME LEADER";
}
