import { describe, it, expect } from "vitest";
import { DEFAULT_REVEAL_LIMIT, revealMoreToggleLabel, revealToggleLabel, sliceForReveal } from "@/lib/session-intelligence/reveal";

describe("sliceForReveal", () => {
  it("defaults to the first 3 items", () => {
    const items = [1, 2, 3, 4, 5];
    const slice = sliceForReveal(items, false);
    expect(DEFAULT_REVEAL_LIMIT).toBe(3);
    expect(slice.visible).toEqual([1, 2, 3]);
    expect(slice.total).toBe(5);
    expect(slice.hiddenCount).toBe(2);
    expect(slice.canReveal).toBe(true);
  });

  it("View All returns the complete existing list", () => {
    const items = ["a", "b", "c", "d"];
    const slice = sliceForReveal(items, true);
    expect(slice.visible).toEqual(items);
    expect(slice.hiddenCount).toBe(0);
    expect(slice.canReveal).toBe(true);
  });

  it("does not offer reveal for empty lists", () => {
    const slice = sliceForReveal([], false);
    expect(slice.visible).toEqual([]);
    expect(slice.total).toBe(0);
    expect(slice.canReveal).toBe(false);
  });

  it("does not offer reveal for exactly 1–3 items", () => {
    expect(sliceForReveal(["a"], false).canReveal).toBe(false);
    expect(sliceForReveal(["a", "b"], false).visible).toEqual(["a", "b"]);
    const three = sliceForReveal(["a", "b", "c"], false);
    expect(three.visible).toEqual(["a", "b", "c"]);
    expect(three.canReveal).toBe(false);
    expect(three.total).toBe(3);
  });

  it("preserves backend order", () => {
    expect(sliceForReveal(["z", "a", "m", "b"], false).visible).toEqual(["z", "a", "m"]);
  });
});

describe("revealToggleLabel", () => {
  it("uses the full item count on View All", () => {
    expect(revealToggleLabel(false, 12)).toBe("View All (12)");
  });

  it("collapses with Show Less", () => {
    expect(revealToggleLabel(true, 12)).toBe("Show Less");
  });
});

describe("revealMoreToggleLabel", () => {
  it("uses remaining count, not a new rank", () => {
    expect(revealMoreToggleLabel(false, 1)).toBe("View 1 more");
    expect(revealMoreToggleLabel(false, 4)).toBe("View 4 more");
  });

  it("collapses with Show less", () => {
    expect(revealMoreToggleLabel(true, 4)).toBe("Show less");
  });
});
