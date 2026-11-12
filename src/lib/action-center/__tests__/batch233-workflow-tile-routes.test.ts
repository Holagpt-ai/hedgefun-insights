import { describe, expect, it } from "vitest";
import { actionCenterWorkflowTileHref } from "@/lib/action-center/workflow-tile-routes";
import { persistHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { SecurityId } from "@/types/security-identity";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";

const SEC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as SecurityId;

function workflow(symbol: string): HistoricalWorkflowContext {
  return {
    securityId: SEC,
    symbol,
    historicalContextAvailable: true,
    evidenceLabels: [],
    sampleSizeQuality: "ROBUST",
    comparableEpisodeCount: 2,
    mostRecentComparableDate: "2026-09-01",
    profileFreshness: "FRESH",
    sourceSurface: "radar",
    handoffAt: "2026-11-12T20:00:00.000Z",
    contextAssembledAt: "2026-11-12T20:00:00.000Z",
  };
}

describe("batch233 actionCenterWorkflowTileHref", () => {
  it("returns generic routes when no handoff symbol", () => {
    expect(actionCenterWorkflowTileHref("/dashboard/watchlist", null)).toBe("/dashboard/watchlist");
    expect(actionCenterWorkflowTileHref("/dashboard/pre-market", "NVDA")).toBe("/dashboard/pre-market");
  });

  it("preserves securityId from session on symbol-aware tiles", () => {
    sessionStorage.clear();
    persistHistoricalWorkflowContext(workflow("NVDA"));
    const routes = workflowSymbolRoutes("NVDA");
    expect(actionCenterWorkflowTileHref("/dashboard/journal", "NVDA")).toBe(routes!.journal);
    expect(actionCenterWorkflowTileHref("/dashboard/journal", "NVDA")).toContain("securityId=");
    expect(actionCenterWorkflowTileHref("/dashboard/screeners", "NVDA")).toBe(routes!.screeners);
  });
});
