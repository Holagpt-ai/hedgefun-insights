import { describe, it, expect } from "vitest";
import { groupCatalystsByExactSourceUrl } from "@/lib/session-intelligence/group-catalysts";

function row(overrides: Partial<{ id: string; symbol: string; source_url: string | null; title: string }>) {
  return {
    id: "1",
    symbol: "AAA",
    source_url: "https://example.com/story" as string | null,
    title: "Story",
    ...overrides,
  };
}

describe("groupCatalystsByExactSourceUrl", () => {
  it("groups only on exact source_url and lists affected symbols in first-seen order", () => {
    const groups = groupCatalystsByExactSourceUrl([
      row({ id: "1", symbol: "AMD", source_url: "https://example.com/chips" }),
      row({ id: "2", symbol: "AVGO", source_url: "https://example.com/chips" }),
      row({ id: "3", symbol: "NVDA", source_url: "https://example.com/chips" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(true);
    expect(groups[0].primary.symbol).toBe("AMD");
    expect(groups[0].symbols).toEqual(["AMD", "AVGO", "NVDA"]);
    expect(groups[0].rows).toHaveLength(3);
  });

  it("does not merge similar titles with different URLs", () => {
    const groups = groupCatalystsByExactSourceUrl([
      row({ id: "1", symbol: "AAA", source_url: "https://a.example/1", title: "Chip rally continues" }),
      row({ id: "2", symbol: "BBB", source_url: "https://b.example/1", title: "Chip rally continues" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it("does not group rows that lack a source_url", () => {
    const groups = groupCatalystsByExactSourceUrl([
      row({ id: "1", symbol: "AAA", source_url: null, title: "Same title" }),
      row({ id: "2", symbol: "BBB", source_url: null, title: "Same title" }),
      row({ id: "3", symbol: "CCC", source_url: "", title: "Same title" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it("treats trailing-slash URL variants as distinct (no canonicalization)", () => {
    const groups = groupCatalystsByExactSourceUrl([
      row({ id: "1", symbol: "AAA", source_url: "https://example.com/story" }),
      row({ id: "2", symbol: "BBB", source_url: "https://example.com/story/" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps ungrouped rows in backend order alongside grouped stories", () => {
    const groups = groupCatalystsByExactSourceUrl([
      row({ id: "1", symbol: "SOLO", source_url: "https://example.com/solo" }),
      row({ id: "2", symbol: "AMD", source_url: "https://example.com/chips" }),
      row({ id: "3", symbol: "AVGO", source_url: "https://example.com/chips" }),
    ]);
    expect(groups.map((g) => g.primary.symbol)).toEqual(["SOLO", "AMD"]);
    expect(groups[1].symbols).toEqual(["AMD", "AVGO"]);
  });
});
