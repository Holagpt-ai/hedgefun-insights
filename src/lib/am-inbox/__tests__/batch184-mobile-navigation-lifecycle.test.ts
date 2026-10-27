import type { MouseEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LATE_SESSION_HANDOFF_STORAGE_KEY } from "@/config/late-session-handoff.config";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import {
  readLateSessionHandoffStore,
  resetLateSessionHandoffStoreForTests,
} from "@/lib/am-inbox/late-session-handoff-storage";
import { AsyncTimeoutError, withTimeout } from "@/lib/async/with-timeout";
import {
  guardedWorkflowLinkClick,
  resetNavGuardForTests,
} from "@/lib/navigation/guarded-link-click";

function ctx(symbol: string) {
  return buildLateSessionContinuationContext({
    symbol,
    sourceSessionDate: "2026-10-26",
    sourceTimestamp: "2026-10-26T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: 1_000_000,
    rvol: 2,
    rvolMetricKind: "rvol_20d",
    dollarVolume: 10_000_000,
  });
}

describe("Batch 184 — mobile navigation & loading lifecycle", () => {
  beforeEach(() => {
    resetLateSessionHandoffStoreForTests();
    resetNavGuardForTests();
    vi.restoreAllMocks();
  });

  it("skips sessionStorage mirror on server-driven AM inbox builds", () => {
    const contexts = Array.from({ length: 40 }, (_, i) => ctx(`SYM${i}`));
    buildAmInboxLateSessionViewFromContexts("2026-10-27", contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(Object.keys(readLateSessionHandoffStore())).toHaveLength(0);
  });

  it("batch-writes collapsed handoffs when mirroring is enabled", () => {
    const writeSpy = vi.spyOn(Storage.prototype, "setItem");
    const contexts = Array.from({ length: 12 }, (_, i) => ctx(`AAA${i}`));
    buildAmInboxLateSessionViewFromContexts("2026-10-27", contexts);
    const handoffWrites = writeSpy.mock.calls.filter(
      ([key]) => key === LATE_SESSION_HANDOFF_STORAGE_KEY,
    );
    expect(handoffWrites).toHaveLength(1);
    writeSpy.mockRestore();
  });

  it("withTimeout rejects when the promise does not settle", async () => {
    await expect(
      withTimeout(new Promise<void>(() => {}), 20, "test_op"),
    ).rejects.toBeInstanceOf(AsyncTimeoutError);
  });

  it("guardedWorkflowLinkClick blocks only duplicate same-destination taps", () => {
    const prevent = vi.fn();
    const mk = (href: string) => {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", href);
      return {
        currentTarget: anchor,
        preventDefault: prevent,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
      } as unknown as MouseEvent<HTMLAnchorElement>;
    };
    guardedWorkflowLinkClick(mk("/dashboard/catalyst?symbol=AAA"));
    guardedWorkflowLinkClick(mk("/dashboard/catalyst?symbol=AAA"));
    guardedWorkflowLinkClick(mk("/dashboard/screeners?symbol=AAA"));
    expect(prevent).toHaveBeenCalledTimes(1);
  });
});
