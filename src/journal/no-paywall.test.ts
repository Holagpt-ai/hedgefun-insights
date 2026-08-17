import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src", "journal");
const BANNED = ["Request Pro " + "Access", "Upgrade to " + "PRO", "Upgrade to " + "Pro"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    if (!/\.(ts|tsx|css)$/.test(name) || /\.test\./.test(name)) return [];
    return [full];
  });
}

describe("journal has no paywall copy", () => {
  it("does not contain Request Pro Access or Upgrade to PRO", () => {
    const files = walk(ROOT);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const phrase of BANNED) {
        if (text.includes(phrase)) hits.push(`${file}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
