import { describe, expect, it } from "vitest";
import {
  actionCenterWorkflowRouteHint,
  actionCenterWorkflowTileHref,
  parseHandoffSecurityId,
  readActionCenterHandoffQuery,
} from "@/lib/action-center/workflow-tile-routes";
import { persistHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { SecurityId } from "@/types/security-identity";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";

const SEC_URL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as SecurityId;
const SEC_SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as SecurityId;
const SEC_OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as SecurityId;

function workflow(symbol: string, securityId: SecurityId): HistoricalWorkflowContext {
  return {
    securityId,
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

describe("batch233 parseHandoffSecurityId", () => {
  it("accepts valid UUID security ids and rejects malformed values", () => {
    expect(parseHandoffSecurityId(SEC_URL)).toBe(SEC_URL);
    expect(parseHandoffSecurityId("not-a-uuid")).toBeNull();
    expect(parseHandoffSecurityId("<script>")).toBeNull();
    expect(parseHandoffSecurityId("")).toBeNull();
  });
});

describe("batch233 readActionCenterHandoffQuery", () => {
  it("returns null without a valid ticker", () => {
    expect(readActionCenterHandoffQuery(new URLSearchParams("symbol=<bad>"))).toBeNull();
  });

  it("captures symbol and validated securityId from the URL", () => {
    const q = new URLSearchParams({ symbol: "nvda", securityId: SEC_URL });
    expect(readActionCenterHandoffQuery(q)).toEqual({
      symbol: "NVDA",
      eventLabel: null,
      securityId: SEC_URL,
    });
  });
});

describe("batch233 actionCenterWorkflowRouteHint", () => {
  it("uses URL securityId without session storage", () => {
    sessionStorage.clear();
    const hint = actionCenterWorkflowRouteHint("NVDA", SEC_URL);
    expect(hint).toEqual({ symbol: "NVDA", securityId: SEC_URL });
    const href = actionCenterWorkflowTileHref("/dashboard/journal", {
      symbol: "NVDA",
      securityId: SEC_URL,
    });
    expect(href).toContain(`securityId=${encodeURIComponent(SEC_URL)}`);
    expect(href).toContain("symbol=NVDA");
  });

  it("falls back to session securityId when URL omits id", () => {
    sessionStorage.clear();
    persistHistoricalWorkflowContext(workflow("NVDA", SEC_SESSION));
    const hint = actionCenterWorkflowRouteHint("NVDA", null);
    expect(hint?.securityId).toBe(SEC_SESSION);
    expect(actionCenterWorkflowTileHref("/dashboard/journal", { symbol: "NVDA", securityId: null })).toBe(
      workflowSymbolRoutes("NVDA")!.journal,
    );
  });

  it("prefers URL securityId over conflicting session identity", () => {
    sessionStorage.clear();
    persistHistoricalWorkflowContext(workflow("NVDA", SEC_SESSION));
    const hint = actionCenterWorkflowRouteHint("NVDA", SEC_URL);
    expect(hint?.securityId).toBe(SEC_URL);
    expect(actionCenterWorkflowTileHref("/dashboard/screeners", { symbol: "NVDA", securityId: SEC_URL })).toBe(
      workflowSymbolRoutes("NVDA", { symbol: "NVDA", securityId: SEC_URL })!.screeners,
    );
    expect(
      actionCenterWorkflowTileHref("/dashboard/screeners", { symbol: "NVDA", securityId: SEC_URL }),
    ).toContain(SEC_URL);
    expect(
      actionCenterWorkflowTileHref("/dashboard/screeners", { symbol: "NVDA", securityId: SEC_URL }),
    ).not.toContain(SEC_SESSION);
  });

  it("ignores malformed URL securityId and uses session when symbol matches", () => {
    sessionStorage.clear();
    persistHistoricalWorkflowContext(workflow("NVDA", SEC_SESSION));
    const handoff = { symbol: "NVDA" as const, securityId: null };
    expect(actionCenterWorkflowTileHref("/dashboard/journal", handoff)).toContain(SEC_SESSION);
  });
});

describe("batch233 actionCenterWorkflowTileHref", () => {
  it("returns generic routes when no handoff symbol", () => {
    expect(actionCenterWorkflowTileHref("/dashboard/watchlist", null)).toBe("/dashboard/watchlist");
    expect(actionCenterWorkflowTileHref("/dashboard/pre-market", { symbol: "NVDA", securityId: null })).toBe(
      "/dashboard/pre-market",
    );
    expect(actionCenterWorkflowTileHref("/dashboard/after-hours", { symbol: "NVDA", securityId: SEC_OTHER })).toBe(
      "/dashboard/after-hours",
    );
  });

  it("preserves securityId from session on symbol-aware tiles", () => {
    sessionStorage.clear();
    persistHistoricalWorkflowContext(workflow("NVDA", SEC_SESSION));
    const routes = workflowSymbolRoutes("NVDA");
    expect(actionCenterWorkflowTileHref("/dashboard/journal", { symbol: "NVDA", securityId: null })).toBe(
      routes!.journal,
    );
    expect(actionCenterWorkflowTileHref("/dashboard/journal", { symbol: "NVDA", securityId: null })).toContain(
      "securityId=",
    );
  });
});
