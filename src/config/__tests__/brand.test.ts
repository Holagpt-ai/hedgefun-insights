import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "@/config/brand";

describe("BRAND config", () => {
  it("activates Stocksist public values", () => {
    expect(BRAND.name).toBe("Stocksist");
    expect(BRAND.domain).toBe("stocksist.com");
    expect(BRAND.displayDomain).toBe("Stocksist.com");
    expect(BRAND.url).toBe("https://stocksist.com");
    expect(BRAND.initials).toBe("S");
    expect(BRAND.supportEmail).toBe("info@stocksist.com");
    expect(BRAND.aiProductName).toBe("Stocksist AI");
  });

  it("does not embed legacy HedgeFun in brand object", () => {
    const serialized = JSON.stringify(BRAND).toLowerCase();
    expect(serialized).not.toContain("hedgefun");
  });
});

const PUBLIC_SURFACE_DIRS = [
  join(process.cwd(), "src/pages"),
  join(process.cwd(), "src/components"),
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walkTsx(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("public brand cutover surfaces", () => {
  it("has no literal HedgeFun in page/component TSX", () => {
    const files = PUBLIC_SURFACE_DIRS.flatMap((d) => walkTsx(d));
    const offenders: string[] = [];
    for (const file of files) {
      let text = readFileSync(file, "utf8");
      text = text
        .replace(/hedgefunPro/gi, "")
        .replace(/hedgefun-[a-z-]+/gi, "")
        .replace(/hedgefun_[a-z_]+/gi, "")
        .replace(/LEGACY_[A-Z_]+/g, "");
      if (/hedgefun\.fun|\bHedgeFun\b/i.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
