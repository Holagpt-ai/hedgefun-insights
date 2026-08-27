import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  McpJsVersionDriftError,
  VERIFIED_MCP_JS_VERSION,
  assertVerifiedMcpJsVersion,
  readInstalledMcpJsVersion,
  resolveEsbuildFromMcpJs,
  resolveMcpJsPackage,
} from "../../../../scripts/mcp-js-compat.mjs";

const ROOT = resolve(".");
const BUNDLE = "supabase/functions/mcp/index.ts";

describe("Windows-safe MCP emitter version guard", () => {
  it("declares the verified plugin version as 0.20.0", () => {
    expect(VERIFIED_MCP_JS_VERSION).toBe("0.20.0");
  });

  it("passes when the installed version matches the verified version", () => {
    const installed = readInstalledMcpJsVersion(ROOT);
    expect(installed).toBe("0.20.0");
    expect(assertVerifiedMcpJsVersion(installed)).toBe(VERIFIED_MCP_JS_VERSION);
  });

  it("fails closed when a different plugin version is simulated", () => {
    expect(() => assertVerifiedMcpJsVersion("0.21.0")).toThrow(McpJsVersionDriftError);
    expect(() => assertVerifiedMcpJsVersion("0.21.0")).toThrow(/@lovable\.dev\/mcp-js@0\.20\.0/);
    expect(() => assertVerifiedMcpJsVersion("0.21.0")).toThrow(/installed version is 0\.21\.0/);
    expect(() => assertVerifiedMcpJsVersion("0.21.0")).toThrow(/The official generated bundle was not overwritten/);
    expect(() => assertVerifiedMcpJsVersion("0.21.0")).toThrow(
      /Review scripts\/mcp-supabase-emit\.mjs against the new plugin/,
    );
  });

  it("does not write the generated bundle when the version guard fails", () => {
    const before = readFileSync(BUNDLE);
    const beforeMtime = statSync(BUNDLE).mtimeMs;
    const emitHref = pathToFileURL(join(ROOT, "scripts/mcp-supabase-emit.mjs")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { syncMcpSupabaseFunction } from ${JSON.stringify(emitHref)};
         await syncMcpSupabaseFunction(${JSON.stringify(ROOT)}, {}, { installedMcpJsVersion: "9.9.9" });`,
      ],
      { encoding: "utf8", cwd: ROOT },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toMatch(/McpJsVersionDriftError|was not overwritten/);
    expect(Buffer.compare(before, readFileSync(BUNDLE))).toBe(0);
    expect(statSync(BUNDLE).mtimeMs).toBe(beforeMtime);
  });
});

describe("esbuild resolution from the MCP plugin context", () => {
  it("resolves esbuild via @lovable.dev/mcp-js, nested or hoisted", () => {
    const resolved = resolveEsbuildFromMcpJs(ROOT);
    expect(resolved).toMatch(/esbuild[/\\]lib[/\\]main\.js$/);

    const mcpJs = resolveMcpJsPackage(ROOT);
    const fromMcpJs = createRequire(mcpJs.pkgPath);
    expect(resolved).toBe(fromMcpJs.resolve("esbuild"));

    const nested = join(mcpJs.dir, "node_modules", "esbuild", "lib", "main.js");
    const hoisted = join(ROOT, "node_modules", "esbuild", "lib", "main.js");
    expect([nested, hoisted]).toContain(resolved);
  });
});
