import { describe, expect, it } from "vitest";
import { POSITION_DECISION_ACTIONS } from "@/lib/ai-trader/contracts";
import {
  AI_TRADER_CURRENT_OPERATING_MODE,
  AI_TRADER_OFF_COPY,
  AI_TRADER_WAITING_COPY,
  aiTraderEmptyStateCopy,
  aiTraderPerformanceLabel,
} from "@/lib/ai-trader/operating-mode";
import {
  AI_TRADER_SHELL_SNAPSHOT,
  createAiTraderShellSnapshot,
} from "@/lib/ai-trader/public-snapshot";

describe("AI Trader shell contracts", () => {
  it("keeps the product mode OFF and uses the inactive sentence", () => {
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.operatingMode).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).not.toBe(AI_TRADER_WAITING_COPY);
  });

  it("stores no trading evidence on the shell snapshot", () => {
    const snapshot = AI_TRADER_SHELL_SNAPSHOT;
    expect(snapshot.scannedSymbols).toEqual([]);
    expect(snapshot.watchlist).toEqual([]);
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.activity).toEqual([]);
    expect(snapshot.trades).toEqual([]);
    expect(snapshot.pnl).toBeNull();
    expect(snapshot.capitalDeployed).toBeNull();
    expect(snapshot.tradeCount).toBe(0);
    expect(snapshot).not.toHaveProperty("provider");
    expect(snapshot).not.toHaveProperty("model");
  });

  it("uses the waiting sentence only for a running mode with no candidate", () => {
    expect(aiTraderEmptyStateCopy("OFF", 0)).toBe(AI_TRADER_OFF_COPY);
    expect(aiTraderEmptyStateCopy("BACKTEST", 0)).toBe(AI_TRADER_OFF_COPY);
    expect(aiTraderEmptyStateCopy("SHADOW", 0)).toBe(AI_TRADER_WAITING_COPY);
    expect(aiTraderEmptyStateCopy("PAPER", 0)).toBe(AI_TRADER_WAITING_COPY);
    expect(aiTraderEmptyStateCopy("CONTROLLED_LIVE", 0)).toBe(AI_TRADER_WAITING_COPY);
    expect(aiTraderEmptyStateCopy("LIVE", 0)).toBe(AI_TRADER_WAITING_COPY);
    expect(aiTraderEmptyStateCopy("LIVE", 1)).toBeNull();
    expect(aiTraderEmptyStateCopy("OFF", 1)).toBeNull();
  });

  it("does not report a performance number while inactive", () => {
    expect(aiTraderPerformanceLabel("OFF", 0)).toBe("—");
    expect(aiTraderPerformanceLabel("BACKTEST", 0)).toBe("—");
    expect(aiTraderPerformanceLabel("SHADOW", 0)).toBe("0");
  });

  it("keeps a running empty snapshot free of invented rows", () => {
    const snapshot = createAiTraderShellSnapshot("SHADOW");
    expect(snapshot.statusCopy).toBe(AI_TRADER_WAITING_COPY);
    expect(snapshot.watchlist).toEqual([]);
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.pnl).toBeNull();
    expect(snapshot.tradeCount).toBe(0);
  });

  it("separates position actions from entry actions and excludes risk increases", () => {
    expect(POSITION_DECISION_ACTIONS).toEqual([
      "HOLD",
      "REDUCE",
      "EXIT",
      "TAKE_PARTIAL",
      "TIGHTEN_STOP",
      "ACTIVATE_TRAIL",
    ]);
    expect(POSITION_DECISION_ACTIONS).not.toContain("ENTER");
    expect(POSITION_DECISION_ACTIONS).not.toContain("ADD");
    expect(POSITION_DECISION_ACTIONS).not.toContain("WIDEN_STOP");
  });
});
