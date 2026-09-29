import { describe, expect, it } from "vitest";
import { selectActionCenterHandoffRows } from "@/lib/action-center/handoff-context";

describe("action center handoff context", () => {
  it("does not create a row from a symbol that is absent from the feed", () => {
    const rows = selectActionCenterHandoffRows({
      symbol: "XYZ",
      feed: [{ key: "scanner:1", symbol: "AAA", title: "AAA — Running Up", sourceLabel: "Scanner event" }],
      leaders: [{ symbol: "AAA" }],
    });
    expect(rows).toEqual([]);
  });

  it("returns only stored rows for the handed-off symbol", () => {
    const rows = selectActionCenterHandoffRows({
      symbol: "xyz",
      feed: [
        { key: "scanner:1", symbol: "XYZ", title: "XYZ — Running Up", sourceLabel: "Scanner event" },
        { key: "scanner:2", symbol: "AAA", title: "AAA — HOD Break", sourceLabel: "Scanner event" },
      ],
      leaders: [],
    });
    expect(rows).toEqual([
      { key: "scanner:1", symbol: "XYZ", source: "Scanner event", title: "XYZ — Running Up" },
    ]);
  });
});
