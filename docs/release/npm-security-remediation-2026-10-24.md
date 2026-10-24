# npm security remediation (ISS-016) — 2026-10-24

**Baseline audit:** 42 vulnerabilities (3 critical, 25 high, 13 moderate, 1 low) — reported October Vercel deploy.  
**After `npm audit fix` (no `--force`):** 21 vulnerabilities (2 critical, 7 high, 12 moderate).  
**After `react-router-dom@6.30.6` (PR #170):** same 21 count; router open-redirect class partially mitigated within v6 line.

**After Batch 171 (PR #171):** **20** vulnerabilities (**0 critical**, 7 high, 13 moderate) — `npm.overrides.tinypool@2.2.0`, `vite@5.4.21`, `vitest@3.2.7`, `@vercel/functions@3.10.3`. Clears critical `tinypool` / `vitest` chain without a Vitest major upgrade.

## Resolved or mitigated (non-breaking)

| Package area | Exposure | Action |
| --- | --- | --- |
| `proxy-addr`, `tinypool` (transitive pre-fix), `brace-expansion`, `minimatch`, `postcss`, `rollup`, `ws`, `nanoid`, `glob`, `flatted`, `form-data`, `fast-uri`, `js-yaml`, `picomatch`, `source-map-js`, `browserslist`, `body-parser`, `ajv`, `@humanfs/node`, `@tootallnate/once`, `hono`, `ip-address`, `qs`, `yaml` | Mostly **dev/build** or **server tooling**; several were transitive fixes via `npm audit fix` | Lockfile updated (`package-lock.json`) |
| `react-router-dom` | **Production** client routing | Pinned **6.30.6** (latest v6 patch) |

## Remaining — documented blockers

| Package | Severity | Production vs dev | Reachability | Blocker | Proposed isolated remediation |
| --- | --- | --- | --- | --- | --- |
| `@modelcontextprotocol/sdk` via `@lovable.dev/mcp-js` | High | **Build/dev** (MCP emitter, not browser runtime) | MCP codegen / CI only | No upstream fix in pinned `@lovable.dev/mcp-js@0.20.0` | Track Lovable MCP release; isolate MCP to devDependency when emitter allows |
| `tinypool` via `vitest@3.2.4` | Critical | **Dev/test only** | Local `vitest` / CI | Fix requires `vitest@5` (`audit fix --force`) | Scheduled vitest major upgrade batch |
| `esbuild` via `vite@5` / `drizzle-kit` | Moderate | **Dev server / drizzle CLI** | Not production bundle | Vite 8 / drizzle-kit chain is breaking | Defer; dev-server only |
| `postcss-selector-parser` via `tailwindcss` / `@tailwindcss/typography` | Moderate | **Build** | CSS build | Typography downgrade is breaking | Tailwind 4 / typography upgrade batch |
| `react-router` / `react-router-dom` | Moderate | **Production** | Client navigation | CVE fixes land in **v7** (`audit fix --force`) | Defer v7 migration; stay on 6.30.6 until dedicated router batch |
| `zod` via `@vercel/functions` | High | **Edge middleware** (`middleware.ts`) | OAuth/meta fetch paths in middleware | `@vercel/functions` pulls nested zod 3.x | Track `@vercel/functions` releases; middleware already uses `@vercel/functions/next` |

## Commands used

```sh
npm audit
npm audit fix          # no --force
npm install react-router-dom@6.30.6 --save-exact
npx update-browserslist-db@latest   # updates caniuse-lite in lockfile (npm)
```

Do **not** run `npm audit fix --force` per project policy.
