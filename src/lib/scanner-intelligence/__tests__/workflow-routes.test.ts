import { describe, expect, it } from "vitest";
import { opportunityWorkflowPaths } from "@/lib/scanner-intelligence/workflow-routes";

describe("opportunity workflow paths", () => {
  it("uses symbol query routes and a single event type", () => {
    const paths = opportunityWorkflowPaths("xyz", "RUNNING_UP");
    expect(paths).toEqual({
      ai: "/dashboard/ai?symbol=XYZ&event=RUNNING_UP",
      catalyst: "/dashboard/catalyst?symbol=XYZ&event=RUNNING_UP",
      journal: "/dashboard/journal?symbol=XYZ&event=RUNNING_UP",
      watchlist: "/dashboard/watchlist?symbol=XYZ",
      screeners: "/dashboard/screeners?symbol=XYZ&event=RUNNING_UP",
      action_center: "/dashboard/action-center?symbol=XYZ&event=RUNNING_UP",
    });
  });

  it("drops an unknown event instead of encoding a payload", () => {
    const paths = opportunityWorkflowPaths("AAA", "not a real event");
    expect(paths?.ai).toBe("/dashboard/ai?symbol=AAA");
    expect(paths?.action_center).toBe("/dashboard/action-center?symbol=AAA");
  });

  it("maps the VWAP break alias onto the persisted type", () => {
    const paths = opportunityWorkflowPaths("AAA", "VWAP_BREAK");
    expect(paths?.catalyst).toBe("/dashboard/catalyst?symbol=AAA&event=VWAP_LOSS");
  });
});
