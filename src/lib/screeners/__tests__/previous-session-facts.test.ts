import { describe, expect, it } from "vitest";
import { candidatePreviousSessionFacts } from "@/lib/screeners/previous-session-facts";

const verified = {
  regularClose: 10,
  previousClose: 8,
  changePercent: 25,
  priorVolume: 225_295,
};

describe("candidate previous-session facts", () => {
  it("keeps the previous close when the after-hours last is more than 1% from the regular close", () => {
    const facts = candidatePreviousSessionFacts({
      ...verified,
      lastPrice: 10.15,
    });
    expect(facts.previous_close).toBe(8);
    expect(facts.previous_close).not.toBe(10.15);
  });

  it("keeps prior-session volume when the after-hours last has drifted far from the regular close", () => {
    const facts = candidatePreviousSessionFacts({
      ...verified,
      lastPrice: 15,
    });
    expect(facts.previous_close).toBe(8);
    expect(facts.prior_session_volume).toBe(225_295);
  });

  it("returns null for both facts when the quote is missing", () => {
    expect(
      candidatePreviousSessionFacts({
        regularClose: null,
        previousClose: null,
        changePercent: null,
        priorVolume: null,
        lastPrice: 10,
      }),
    ).toEqual({ previous_close: null, prior_session_volume: null });
  });

  it("does not substitute 0 for a coerced missing close or prior volume", () => {
    const facts = candidatePreviousSessionFacts({
      regularClose: 0,
      previousClose: 0,
      changePercent: 0,
      priorVolume: 0,
      lastPrice: 10,
    });
    expect(facts.previous_close).toBeNull();
    expect(facts.prior_session_volume).toBeNull();
  });

  it("drops the previous close on a near-integer 2× scale change and still keeps prior volume", () => {
    const facts = candidatePreviousSessionFacts({
      ...verified,
      lastPrice: 20,
    });
    expect(facts.previous_close).toBeNull();
    expect(facts.prior_session_volume).toBe(225_295);
  });

  it("does not recover the previous close from the Radar last", () => {
    const facts = candidatePreviousSessionFacts({
      ...verified,
      lastPrice: 12,
    });
    const fromLast = 12 / (1 + 25 / 100);
    expect(facts.previous_close).toBe(8);
    expect(facts.previous_close).not.toBeCloseTo(fromLast, 6);
  });
});
