import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureToastNotificationBaselineMs,
  getToastNotificationBaselineMs,
} from "@/lib/notifications/toast-notification-baseline";

describe("toast notification baseline", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("creates a stable baseline per account for the browser session", () => {
    const first = getToastNotificationBaselineMs("ns", "user-a", 1000);
    const second = getToastNotificationBaselineMs("ns", "user-a", 9000);
    expect(first).toBe(1000);
    expect(second).toBe(1000);
  });

  it("isolates baselines between accounts", () => {
    expect(getToastNotificationBaselineMs("ns", "user-a", 1000)).toBe(1000);
    expect(getToastNotificationBaselineMs("ns", "user-b", 2000)).toBe(2000);
  });

  it("resets baseline on a new browser session", () => {
    expect(getToastNotificationBaselineMs("ns", "user-a", 1000)).toBe(1000);
    sessionStorage.clear();
    expect(getToastNotificationBaselineMs("ns", "user-a", 8000)).toBe(8000);
  });

  it("ensure is idempotent within the same session", () => {
    ensureToastNotificationBaselineMs("ns", "user-a", 1000);
    expect(ensureToastNotificationBaselineMs("ns", "user-a", 5000)).toBe(1000);
  });
});
