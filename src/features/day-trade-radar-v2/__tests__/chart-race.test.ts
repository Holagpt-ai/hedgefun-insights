import { describe, expect, it } from "vitest";

/**
 * Race-safety model for chart requests: only the latest request id may commit.
 * Mirrors useRadarChartData's requestIdRef guard.
 */
function createChartRequestGate() {
  let latest = 0;
  return {
    begin(): number {
      latest += 1;
      return latest;
    },
    canCommit(id: number): boolean {
      return id === latest;
    },
  };
}

describe("radar chart request race", () => {
  it("11. rapid ticker changes cannot commit a stale prior response", () => {
    const gate = createChartRequestGate();
    const first = gate.begin(); // AAPL
    const second = gate.begin(); // TSLA — newer selection
    expect(gate.canCommit(first)).toBe(false);
    expect(gate.canCommit(second)).toBe(true);
  });
});
