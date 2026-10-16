import { describe, expect, it } from "vitest";
import { priceAlertToastViewPath, scannerAlertToastViewPath } from "@/lib/alerts/alert-workflow-navigation";

describe("alert workflow navigation", () => {
  it("routes price alerts to symbol-aware Action Center", () => {
    expect(priceAlertToastViewPath("aapl")).toBe("/dashboard/action-center?symbol=AAPL");
  });

  it("routes scanner alerts with event identity", () => {
    expect(scannerAlertToastViewPath({ symbol: "XYZ", event_type: "RUNNING_UP" })).toBe(
      "/dashboard/action-center?symbol=XYZ&event=RUNNING_UP",
    );
  });
});
