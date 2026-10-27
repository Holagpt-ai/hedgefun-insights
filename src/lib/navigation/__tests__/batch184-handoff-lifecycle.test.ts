import type { MouseEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferHandoffSideEffect } from "@/lib/navigation/defer-handoff-side-effect";
import {
  guardedWorkflowLinkClick,
  resetNavGuardForTests,
} from "@/lib/navigation/guarded-link-click";
import {
  persistHistoricalWorkflowContext,
  readHistoricalWorkflowContext,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import { touchWorkflowHandoff } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { SecurityId } from "@/types/security-identity";

const SEC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SecurityId;

function workflow(symbol: string): HistoricalWorkflowContext {
  return {
    securityId: SEC,
    symbol,
    historicalContextAvailable: true,
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    sampleSizeQuality: "ROBUST",
    comparableEpisodeCount: 4,
    mostRecentComparableDate: "2026-10-20",
    profileFreshness: "FRESH",
    sourceSurface: "radar",
    handoffAt: "2026-10-26T19:00:00.000Z",
    contextAssembledAt: "2026-10-26T19:00:00.000Z",
  };
}

function anchorEvent(href: string, overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn();
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  return {
    event: {
      currentTarget: anchor,
      preventDefault,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      ...overrides,
    } as unknown as MouseEvent<HTMLAnchorElement>,
    preventDefault,
  };
}

describe("Batch 184 — deferred handoff lifecycle", () => {
  beforeEach(() => {
    resetNavGuardForTests();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("defers sessionStorage writes until after the current turn", async () => {
    let ran = false;
    deferHandoffSideEffect(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await Promise.resolve();
    expect(ran).toBe(true);
  });

  it("persists inbox handoff context before a destination would read it on the next turn", async () => {
    persistHistoricalWorkflowContext(workflow("NVDA"));
    const before = readHistoricalWorkflowContext("NVDA")!.handoffAt;

    guardedWorkflowLinkClick(
      anchorEvent("/dashboard/catalyst?symbol=NVDA").event,
      () => touchWorkflowHandoff("NVDA", "inbox"),
    );

    expect(readHistoricalWorkflowContext("NVDA")!.handoffAt).toBe(before);
    await Promise.resolve();
    expect(readHistoricalWorkflowContext("NVDA")!.handoffAt).not.toBe(before);
    expect(readHistoricalWorkflowContext("NVDA")!.sourceSurface).toBe("inbox");
  });

  it("blocks duplicate same-destination taps but allows a different destination", () => {
    const first = anchorEvent("/dashboard/catalyst?symbol=NVDA");
    const duplicate = anchorEvent("/dashboard/catalyst?symbol=NVDA");
    const other = anchorEvent("/dashboard/screeners?symbol=NVDA");

    guardedWorkflowLinkClick(first.event);
    guardedWorkflowLinkClick(duplicate.event);
    guardedWorkflowLinkClick(other.event);

    expect(first.preventDefault).not.toHaveBeenCalled();
    expect(duplicate.preventDefault).toHaveBeenCalledTimes(1);
    expect(other.preventDefault).not.toHaveBeenCalled();
  });

  it("does not block modified-click navigation", () => {
    const modified = anchorEvent("/dashboard/ai?symbol=NVDA", { metaKey: true });
    guardedWorkflowLinkClick(modified.event, () => touchWorkflowHandoff("NVDA", "inbox"));
    expect(modified.preventDefault).not.toHaveBeenCalled();
  });
});
