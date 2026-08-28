import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERIFIED_MCP_JS_VERSION } from "../../../../scripts/mcp-js-compat.mjs";

describe("Vercel/npm install determinism for @lovable.dev/mcp-js", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const bunLock = readFileSync("bun.lock", "utf8");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const spec = pkg.dependencies["@lovable.dev/mcp-js"] as string;
  const locked = lock.packages["node_modules/@lovable.dev/mcp-js"];

  it("pins the verified MCP version with no floating range", () => {
    expect(VERIFIED_MCP_JS_VERSION).toBe("0.20.0");
    expect(spec).toBe("0.20.0");
    expect(spec).not.toMatch(/[\^~><*xX]/);
    expect(pkg.packageManager).toBe("npm@11.16.0");
  });

  it("records 0.20.0 from the public npm registry in package-lock.json", () => {
    expect(lock.packages[""].dependencies["@lovable.dev/mcp-js"]).toBe("0.20.0");
    expect(locked.version).toBe("0.20.0");
    expect(locked.resolved).toBe(
      "https://registry.npmjs.org/@lovable.dev/mcp-js/-/mcp-js-0.20.0.tgz",
    );
  });

  it("keeps bun.lock on the same exact MCP version for Lovable", () => {
    expect(bunLock).toContain('"@lovable.dev/mcp-js": "0.20.0"');
    expect(bunLock).toContain("@lovable.dev/mcp-js@0.20.0");
    expect(bunLock).not.toContain('"@lovable.dev/mcp-js": "^0.20.0"');
  });

  it("forces Vercel to npm ci instead of inferring an installer from mixed lockfiles", () => {
    expect(vercel.installCommand).toBe("npm ci");
  });
});
