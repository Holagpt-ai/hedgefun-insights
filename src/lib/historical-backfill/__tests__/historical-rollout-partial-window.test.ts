import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import {
  HISTORICAL_CATCHUP_LIMITS,
  HISTORICAL_CATCHUP_TARGET_ENV,
} from "@/config/historical-catchup.config";
import { runHistoricalCatchUpRollout } from "@/lib/historical-backfill/production-rollout";
import type { HistoricalPersistence } from "@/lib/persistence/historical-persistence";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";

const TARGET = "2026-10-20";
const DATE_FROM = HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;

function referenceOk(symbol: string) {
  return {
    status: "OK",
    results: {
      ticker: symbol,
      name: `${symbol} Inc`,
      primary_exchange: "XNAS",
      locale: "us",
      type: "CS",
      list_date: "2020-01-01",
    },
  };
}

function buildFetchMock(handlers: { failRateLimitAt?: string }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v3/reference/tickers/")) {
      const symbol = decodeURIComponent(url.match(/tickers\/([^/?]+)/)?.[1] ?? "").toUpperCase();
      if (handlers.failRateLimitAt && symbol === handlers.failRateLimitAt) {
        return new Response(JSON.stringify({ status: "ERROR" }), { status: 429 });
      }
      return new Response(JSON.stringify(referenceOk(symbol)), { status: 200 });
    }
    if (url.includes("/vX/reference/tickers/") && url.includes("/events")) {
      return new Response(JSON.stringify({ status: "OK", results: { events: [] } }), { status: 200 });
    }
    if (url.includes("/v2/aggs/ticker/")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          resultsCount: 1,
          results: [{ t: Date.parse(`${DATE_FROM}T00:00:00Z`), o: 1, h: 1, l: 1, c: 1, v: 1_000 }],
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  });
}

function buildPersistence(eligible: string[]): HistoricalPersistence {
  const identity = createSecurityIdentityStore();
  const intelligence = createSecurityIntelligenceStore();
  return {
    transport: "postgres",
    identity,
    intelligence,
    rollout: {
      findInterruptedJob: async () => null,
      loadBackfilledSymbols: async () => new Set(),
      loadSymbolSessionCoverage: async () => [],
      loadEligibleSymbols: async () => eligible,
    },
    close: async () => undefined,
  } as unknown as HistoricalPersistence;
}

function captureLogEvents(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => {
      try {
        return JSON.parse(String(call[0])) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((row): row is Record<string, unknown> => row !== null && typeof row.event === "string");
}

const ROLLOUT_SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/historical-backfill/production-rollout.ts"),
  "utf8",
);

describe("runHistoricalCatchUpRollout partial-window cursor safety", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("POLYGON_API_KEY", "test-polygon-key");
    vi.stubEnv(HISTORICAL_CATCHUP_TARGET_ENV, TARGET);
    vi.stubEnv("HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_DATE", "");
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rolls out control-flow guards in production-rollout (cursor helper, partial batch break)", () => {
    expect(ROLLOUT_SOURCE).toContain("applyCatchUpWindowQueueCursor");
    expect(ROLLOUT_SOURCE).toContain("resolutionInterruptedAtIndex");
    expect(ROLLOUT_SOURCE).toMatch(/resolutionStopped && securityIds\.length === 0/);
    expect(ROLLOUT_SOURCE).toMatch(/if \(resolutionStopped\) break;/);
  });

  it("exclusive-advances past a fully processed all-deferred window", async () => {
    const eligible = ["BAD1", "BAD2", "BAD3"];
    vi.stubGlobal("fetch", buildFetchMock({}));
    const failAll = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v3/reference/tickers/")) {
        const symbol = decodeURIComponent(url.match(/tickers\/([^/?]+)/)?.[1] ?? "").toUpperCase();
        return new Response(JSON.stringify({ status: "NOT_FOUND" }), { status: 404 });
      }
      if (url.includes("/events")) {
        return new Response(JSON.stringify({ status: "OK", results: { events: [] } }), { status: 200 });
      }
      if (url.includes("/v2/aggs")) {
        return new Response(
          JSON.stringify({
            status: "OK",
            resultsCount: 1,
            results: [{ t: Date.parse(`${DATE_FROM}T00:00:00Z`), o: 1, h: 1, l: 1, c: 1, v: 1_000 }],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", failAll);
    const limits = {
      ...HISTORICAL_CATCHUP_LIMITS,
      maxBatchesPerRun: 1,
      maxSymbolsPerRun: 8,
      maxProviderRequestsPerRun: 200,
      maxEmptyResolutionBatches: 3,
    };
    await runHistoricalCatchUpRollout({
      targetSession: TARGET,
      limits,
      persistenceOverride: buildPersistence(eligible),
      loadLocalEnv: false,
    });
    const events = captureLogEvents(logSpy);
    const queueState = events.find((e) => e.event === "catch_up_queue_state");
    expect(queueState?.queueAfterSymbol).toBe("BAD3");
  });
});