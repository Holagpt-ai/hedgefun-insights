import { beforeEach, describe, expect, it } from "vitest";
import { getToastNotificationBaselineMs } from "@/lib/notifications/toast-notification-baseline";

describe("toast notification baseline", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a stable baseline per account", () => {
    const first = getToastNotificationBaselineMs("ns", "user-a", 1000);
    const second = getToastNotificationBaselineMs("ns", "user-a", 9000);
    expect(first).toBe(1000);
    expect(second).toBe(1000);
  });

  it("isolates baselines between accounts", () => {
    expect(getToastNotificationBaselineMs("ns", "user-a", 1000)).toBe(1000);
    expect(getToastNotificationBaselineMs("ns", "user-b", 2000)).toBe(2000);
  });
});
