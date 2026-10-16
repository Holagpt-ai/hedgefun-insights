import { describe, expect, it } from "vitest";

function safeNext(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

describe("auth redirect safety", () => {
  it("honors same-origin next paths", () => {
    expect(safeNext("/dashboard/screeners")).toBe("/dashboard/screeners");
  });

  it("rejects external and protocol-relative next values", () => {
    expect(safeNext("https://evil.test")).toBe("/dashboard");
    expect(safeNext("//evil.test")).toBe("/dashboard");
  });
});
