import { beforeEach, describe, expect, it } from "vitest";
import {
  markAccountToastHistory,
  readAccountToastHistory,
  readAccountToastHistoryEntries,
} from "@/lib/notifications/account-toast-history";

describe("account toast history", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scopes notification state to the signed-in account", () => {
    markAccountToastHistory("test-ns", "user-a", "alert-1", {
      nowMs: 1000,
      maxAgeMs: 60_000,
      maxEntries: 10,
    });
    expect(readAccountToastHistory("test-ns", "user-a", { nowMs: 1000, maxAgeMs: 60_000, maxEntries: 10 }).has("alert-1")).toBe(true);
    expect(readAccountToastHistory("test-ns", "user-b", { nowMs: 1000, maxAgeMs: 60_000, maxEntries: 10 }).has("alert-1")).toBe(false);
  });

  it("drops entries outside the retention window", () => {
    markAccountToastHistory("test-ns", "user-a", "old", {
      nowMs: 0,
      maxAgeMs: 1000,
      maxEntries: 10,
    });
    expect(readAccountToastHistory("test-ns", "user-a", { nowMs: 2000, maxAgeMs: 1000, maxEntries: 10 }).has("old")).toBe(false);
  });

  it("preserves original timestamps when adding a new event", () => {
    markAccountToastHistory("test-ns", "user-a", "first", {
      nowMs: 1000,
      maxAgeMs: 60_000,
      maxEntries: 10,
    });
    markAccountToastHistory("test-ns", "user-a", "second", {
      nowMs: 5000,
      maxAgeMs: 60_000,
      maxEntries: 10,
    });
    const entries = readAccountToastHistoryEntries("test-ns", "user-a", {
      nowMs: 5000,
      maxAgeMs: 60_000,
      maxEntries: 10,
    });
    expect(entries.find((e) => e.k === "first")?.at).toBe(1000);
    expect(entries.find((e) => e.k === "second")?.at).toBe(5000);
  });

  it("ages out the first event while a newer mark keeps a later event", () => {
    markAccountToastHistory("test-ns", "user-a", "old", { nowMs: 0, maxAgeMs: 1000, maxEntries: 10 });
    markAccountToastHistory("test-ns", "user-a", "new", { nowMs: 900, maxAgeMs: 1000, maxEntries: 10 });
    const at1500 = readAccountToastHistoryEntries("test-ns", "user-a", {
      nowMs: 1500,
      maxAgeMs: 1000,
      maxEntries: 10,
    });
    expect(at1500.map((e) => e.k)).toEqual(["new"]);
  });
});
