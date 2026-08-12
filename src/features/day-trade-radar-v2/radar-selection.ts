import type { RadarRankedRow, RadarSelectionState } from "./types";

export type RadarSelectionAction =
  | { type: "board_updated"; rows: RadarRankedRow[] }
  | { type: "select_manual"; row: RadarRankedRow }
  | { type: "follow_leader"; rows: RadarRankedRow[] }
  | { type: "return_to_leader"; rows: RadarRankedRow[] }
  | { type: "reset" };

export const INITIAL_RADAR_SELECTION: RadarSelectionState = {
  mode: "follow_leader",
  selectedSymbol: null,
  snapshot: null,
  inactive: false,
};

function leaderOf(rows: readonly RadarRankedRow[]): RadarRankedRow | null {
  return rows.length > 0 ? rows[0] : null;
}

function findBySymbol(
  rows: readonly RadarRankedRow[],
  symbol: string | null,
): RadarRankedRow | null {
  if (!symbol) return null;
  return rows.find((r) => r.symbol === symbol) ?? null;
}

/**
 * Pure selection reducer — symbol-locked manual mode survives reordering.
 */
export function radarSelectionReducer(
  state: RadarSelectionState,
  action: RadarSelectionAction,
): RadarSelectionState {
  switch (action.type) {
    case "reset":
      return { ...INITIAL_RADAR_SELECTION };

    case "follow_leader":
    case "return_to_leader": {
      const leader = leaderOf(action.rows);
      if (!leader) {
        return {
          mode: "follow_leader",
          selectedSymbol: null,
          snapshot: null,
          inactive: false,
        };
      }
      return {
        mode: "follow_leader",
        selectedSymbol: leader.symbol,
        snapshot: leader,
        inactive: false,
      };
    }

    case "select_manual":
      return {
        mode: "manual",
        selectedSymbol: action.row.symbol,
        snapshot: action.row,
        inactive: false,
      };

    case "board_updated": {
      const { rows } = action;
      if (rows.length === 0) {
        if (state.mode === "manual" && state.snapshot) {
          return { ...state, inactive: true };
        }
        return {
          mode: "follow_leader",
          selectedSymbol: null,
          snapshot: null,
          inactive: false,
        };
      }

      if (state.mode === "follow_leader" || state.selectedSymbol === null) {
        const leader = leaderOf(rows)!;
        return {
          mode: "follow_leader",
          selectedSymbol: leader.symbol,
          snapshot: leader,
          inactive: false,
        };
      }

      const current = findBySymbol(rows, state.selectedSymbol);
      if (current) {
        return {
          mode: "manual",
          selectedSymbol: current.symbol,
          snapshot: current,
          inactive: false,
        };
      }

      // Locked symbol left the board — keep snapshot, mark inactive.
      return {
        mode: "manual",
        selectedSymbol: state.selectedSymbol,
        snapshot: state.snapshot
          ? { ...state.snapshot, signal: "INACTIVE" }
          : null,
        inactive: true,
      };
    }

    default:
      return state;
  }
}
