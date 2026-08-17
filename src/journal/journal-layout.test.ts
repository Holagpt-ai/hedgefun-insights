import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("journal right-side safe area", () => {
  it("reserves Journal-scoped space for the floating control", () => {
    const css = readFileSync(path.resolve(__dirname, "./journal.css"), "utf8");
    expect(css).toContain("--journal-right-safe");
    expect(css).toContain("--journal-floating-control-size: 52px");
    expect(css).toContain("padding-right: max(16px, var(--journal-right-safe))");
  });
});
