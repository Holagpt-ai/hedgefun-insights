import { beforeEach, describe, expect, it } from "vitest";
import {
  markAccountToastHistory,
  readAccountToastHistory,
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
});
