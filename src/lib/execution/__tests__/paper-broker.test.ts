import { describe, it, expect } from "vitest";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";

describe("PaperBrokerAdapter", () => {
  it("fills market buy and opens position", async () => {
    const paper = new PaperBrokerAdapter({ initialBuyingPower: 10_000 });
    paper.setReferencePrice("AAA", 10);
    const result = await paper.submitOrder({
      kind: "market",
      symbol: "AAA",
      side: "buy",
      quantity: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.order?.isSimulated).toBe(true);
    const positions = await paper.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(10);
  });

  it("does not cancel an already-filled simulated order", async () => {
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice("BBB", 5);
    const submitted = await paper.submitOrder({
      kind: "limit",
      symbol: "BBB",
      side: "buy",
      quantity: 1,
      limitPrice: 5,
    });
    expect(submitted.ok).toBe(true);
    const cancelled = await paper.cancelOrder(submitted.order!.orderId);
    expect(cancelled.ok).toBe(false);
    expect(cancelled.errorCode).toBe("NOT_CANCELLABLE");
  });

  it("closePosition reduces simulated holding", async () => {
    const paper = new PaperBrokerAdapter({ initialBuyingPower: 10_000 });
    paper.setReferencePrice("CCC", 8);
    await paper.submitOrder({ kind: "market", symbol: "CCC", side: "buy", quantity: 5 });
    const close = await paper.closePosition({ symbol: "CCC" });
    expect(close.ok).toBe(true);
    const positions = await paper.getPositions();
    expect(positions).toHaveLength(0);
  });
});
