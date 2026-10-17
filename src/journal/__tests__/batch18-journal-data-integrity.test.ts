import { describe, expect, it, vi } from "vitest";
import { resolveJournalEquityView, unavailableJournalReconciliation } from "../lib/equity-evidence";
import { resolveReportedBalanceForScope } from "../lib/account-enrichment";
import {
  DEFAULT_LIVE_FILTERS,
  rangeBounds,
  sanitizeLiveFilters,
  userStorageKey,
  writeUserJson,
} from "../lib/storage";
import { shouldApplyJournalLoad } from "../workspace/journal-load-fence";
import { parseDecimal } from "../calc/decimal";

describe("Batch 18 — Journal data integrity", () => {
  it("rejects stale journal load after user switch", () => {
    expect(shouldApplyJournalLoad("user-a", 1, "user-b", 1)).toBe(false);
    expect(shouldApplyJournalLoad("user-a", 1, "user-a", 2)).toBe(false);
    expect(shouldApplyJournalLoad("user-a", 2, "user-a", 2)).toBe(true);
  });

  it("keeps P&L metrics path separate from unavailable equity", () => {
    const view = resolveJournalEquityView({
      beginningBalance: null,
      reportedBalance: null,
      realizedPnl: parseDecimal("1250.50"),
    });
    expect(view.equityAvailable).toBe(false);
    expect(view.equity).toBeNull();
    expect(view.reconciliationState.state).toBe("pending_review");
  });

  it("does not reconcile missing beginning balance against zero derived equity", () => {
    const view = resolveJournalEquityView({
      beginningBalance: null,
      reportedBalance: 10_000,
      reportedAsOf: "2026-03-16T20:00:00.000Z",
      realizedPnl: parseDecimal("250"),
    });
    expect(view.reconciliationState.state).toBe("pending_review");
    expect(view.reconciliationState.difference).toBeNull();
    expect(unavailableJournalReconciliation(10_000).state).toBe("pending_review");
  });

  it("requires complete reported coverage for All Accounts reconciliation scope", () => {
    const partial = resolveReportedBalanceForScope(
      [
        { id: "a", name: "A", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 100, reportedAsOf: "2026-03-16T12:00:00.000Z" },
        { id: "b", name: "B", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: null, reportedAsOf: null },
      ],
      "all",
    );
    expect(partial.reportedBalance).toBeNull();

    const selected = resolveReportedBalanceForScope(
      [
        { id: "a", name: "A", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 100, reportedAsOf: "2026-03-16T12:00:00.000Z" },
        { id: "b", name: "B", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: null, reportedAsOf: null },
      ],
      "a",
    );
    expect(selected.reportedBalance).toBe(100);
  });

  it("reconciles when beginning and reported balances exist", () => {
    const realized = parseDecimal("150");
    const view = resolveJournalEquityView({
      beginningBalance: 10_000,
      reportedBalance: 10_150,
      reportedAsOf: "2026-03-16T20:00:00.000Z",
      realizedPnl: realized,
    });
    expect(view.equityAvailable).toBe(true);
    expect(view.reconciliationState.state).toBe("reconciled");
  });

  it("does not apply august demo range to live mode filters", () => {
    const next = sanitizeLiveFilters(
      { accountId: "all", range: "augustDemo", asset: "all" },
      ["acct-1"],
      "live",
    );
    expect(next.range).toBe(DEFAULT_LIVE_FILTERS.range);
  });

  it("resets missing account filter to all accounts when validation is enabled", () => {
    const next = sanitizeLiveFilters(
      { accountId: "gone-account", range: "week", asset: "all" },
      ["acct-1"],
      "live",
      { validateAccountIds: true },
    );
    expect(next.accountId).toBe("all");
  });

  it("preserves saved account filter while account ids are not yet loaded", () => {
    const next = sanitizeLiveFilters(
      { accountId: "acct-b", range: "week", asset: "all" },
      [],
      "live",
      { validateAccountIds: false },
    );
    expect(next.accountId).toBe("acct-b");
  });

  it("does not reset a live account selection against demo workspace account ids", () => {
    const next = sanitizeLiveFilters(
      { accountId: "acct-live-1", range: "mtd", asset: "all" },
      ["demo-account-main"],
      "demo",
      { validateAccountIds: false },
    );
    expect(next.accountId).toBe("acct-live-1");
  });

  it("validates live account selection only against loaded live account ids", () => {
    const kept = sanitizeLiveFilters(
      { accountId: "acct-live-1", range: "mtd", asset: "all" },
      ["acct-live-1"],
      "demo",
      { validateAccountIds: true },
    );
    expect(kept.accountId).toBe("acct-live-1");

    const reset = sanitizeLiveFilters(
      { accountId: "acct-live-1", range: "mtd", asset: "all" },
      ["acct-other"],
      "live",
      { validateAccountIds: true },
    );
    expect(reset.accountId).toBe("all");
  });

  it("withholds aggregate reported timestamp when any account as-of is missing or mismatched", () => {
    const missingAsOf = resolveReportedBalanceForScope(
      [
        { id: "a", name: "A", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 100, reportedAsOf: "2026-03-16T12:00:00.000Z" },
        { id: "b", name: "B", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 50, reportedAsOf: null },
      ],
      "all",
    );
    expect(missingAsOf.reportedBalance).toBeNull();
    expect(missingAsOf.reportedAsOf).toBeNull();

    const mismatched = resolveReportedBalanceForScope(
      [
        { id: "a", name: "A", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 100, reportedAsOf: "2026-03-16T12:00:00.000Z" },
        { id: "b", name: "B", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 50, reportedAsOf: "2026-03-17T12:00:00.000Z" },
      ],
      "all",
    );
    expect(mismatched.reportedBalance).toBeNull();
    expect(mismatched.reportedAsOf).toBeNull();

    const compatible = resolveReportedBalanceForScope(
      [
        { id: "a", name: "A", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 100, reportedAsOf: "2026-03-16T12:00:00.000Z" },
        { id: "b", name: "B", type: "personal", baseCurrency: "USD", beginningBalance: null, reportedBalance: 50, reportedAsOf: "2026-03-16T12:00:00.000Z" },
      ],
      "all",
    );
    expect(compatible.reportedBalance).toBe(150);
    expect(compatible.reportedAsOf).toBe("2026-03-16T12:00:00.000Z");
  });

  it("marks All Accounts reconciliation unavailable when aggregate reported evidence is incomplete", () => {
    const view = resolveJournalEquityView({
      beginningBalance: 10_000,
      reportedBalance: null,
      reportedAsOf: null,
      realizedPnl: parseDecimal("0"),
    });
    expect(view.equityAvailable).toBe(true);
    expect(view.reconciliationState.state).toBe("pending_review");
    expect(view.reconciliationState.difference).toBeNull();
  });

  it("uses ET calendar boundaries for today and week filters", () => {
    const mondayLateEt = new Date("2026-03-16T23:30:00.000Z"); // 7:30 PM ET
    expect(rangeBounds("today", mondayLateEt)).toEqual({ from: "2026-03-16", to: "2026-03-16" });
    expect(rangeBounds("week", mondayLateEt).from).toBe("2026-03-16");

    const sundayEt = new Date("2026-03-15T15:00:00.000Z");
    expect(rangeBounds("week", sundayEt).from).toBe("2026-03-09");
  });

  it("scopes draft storage keys per authenticated user", () => {
    expect(userStorageKey("stocksist-journal-trade-draft", "user-a")).toBe(
      "stocksist-journal-trade-draft:user-a",
    );
    expect(userStorageKey("stocksist-journal-trade-draft", null)).toBeNull();
  });

  it("does not write previous-user draft under a new user key", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });
    writeUserJson("stocksist-journal-trade-draft", "user-a", { symbol: "AAA" });
    writeUserJson("stocksist-journal-trade-draft", "user-b", { symbol: "BBB" });
    expect(JSON.parse(store.get("stocksist-journal-trade-draft:user-a")!)).toEqual({ symbol: "AAA" });
    expect(JSON.parse(store.get("stocksist-journal-trade-draft:user-b")!)).toEqual({ symbol: "BBB" });
    vi.unstubAllGlobals();
  });
});
