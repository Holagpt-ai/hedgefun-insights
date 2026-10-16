import { describe, expect, it } from "vitest";
import { formatPriceAlertToastDescription } from "@/lib/price-alerts/toast-presentation";

describe("price alert toast presentation", () => {
  it("labels market observation separately from the observed price line", () => {
    const text = formatPriceAlertToastDescription({
      observedPrice: 10.5,
      thresholdLabel: "$10.00",
      dataLatency: "delayed",
      triggeredAt: "2026-10-06T14:30:00.000Z",
    });
    expect(text).toContain("Observed $10.50");
    expect(text).toContain("Market observation:");
  });
});
