/**
 * Compatibility contract for the Windows-safe MCP re-emitter.
 * Kept free of Vite so unit tests can load it under jsdom.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Exact @lovable.dev/mcp-js release scripts/mcp-supabase-emit.mjs was reviewed against. */
export const VERIFIED_MCP_JS_VERSION = "0.20.0";

export class McpJsVersionDriftError extends Error {
  /**
   * @param {string} installedVersion
   */
  constructor(installedVersion) {
    super(
      `Windows-safe MCP emitter is verified against @lovable.dev/mcp-js@${VERIFIED_MCP_JS_VERSION}, ` +
        `but the installed version is ${installedVersion}. ` +
        `Review scripts/mcp-supabase-emit.mjs against the new plugin before regenerating ` +
        `(esbuild flags, AUTO-GENERATED banner, imports, import.meta.env inlining, and output structure may have changed). ` +
        `The official generated bundle was not overwritten.`,
    );
    this.name = "McpJsVersionDriftError";
    this.installedVersion = installedVersion;
    this.verifiedVersion = VERIFIED_MCP_JS_VERSION;
  }
}

function findNamedPackageRoot(startFile, packageName) {
  let dir = dirname(startFile);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.name === packageName) return { dir, pkgPath, version: pkg.version };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package root for ${packageName} from ${startFile}`);
    }
    dir = parent;
  }
}

export function resolveMcpJsPackage(projectRoot) {
  const fromProject = createRequire(join(projectRoot, "package.json"));
  const entry = fromProject.resolve("@lovable.dev/mcp-js");
  return findNamedPackageRoot(entry, "@lovable.dev/mcp-js");
}

export function readInstalledMcpJsVersion(projectRoot) {
  return resolveMcpJsPackage(projectRoot).version;
}

export function assertVerifiedMcpJsVersion(installedVersion) {
  if (installedVersion !== VERIFIED_MCP_JS_VERSION) {
    throw new McpJsVersionDriftError(installedVersion);
  }
  return installedVersion;
}

/**
 * Resolve esbuild from @lovable.dev/mcp-js's dependency context, not from this
 * repo's root. Node walks node_modules from the mcp-js package directory, so a
 * nested `mcp-js/node_modules/esbuild` wins when present and a hoisted copy is
 * used when the plugin's dependency is flattened.
 */
export function resolveEsbuildFromMcpJs(projectRoot) {
  const mcpJs = resolveMcpJsPackage(projectRoot);
  const fromMcpJs = createRequire(mcpJs.pkgPath);
  try {
    return fromMcpJs.resolve("esbuild");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not resolve esbuild from @lovable.dev/mcp-js@${mcpJs.version} ` +
        `(verified emitter ${VERIFIED_MCP_JS_VERSION}). ${detail}`,
    );
  }
}

export function loadEsbuildFromMcpJs(projectRoot) {
  const fromMcpJs = createRequire(resolveMcpJsPackage(projectRoot).pkgPath);
  return fromMcpJs("esbuild");
}
