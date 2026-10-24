# Lovable / Vercel October 24 warning register

Master reset classification after PRs **#169**, **#170**, and Batch **171**. Evidence is git tests and docs unless noted.

| # | Reported condition | Classification | Evidence / tracker |
| --- | --- | --- | --- |
| LOV-01 | npm audit **42** advisories on deploy | **Implemented / code mitigated** (partial) | PR #170 → 21; Batch 171 → **20**, **0 critical** (`tinypool` override). `docs/release/npm-security-remediation-2026-10-24.md` |
| LOV-02 | Production JS bundle ~**3.45 MB** | **Implemented / code mitigated** (partial) | PR #170 lazy dashboard routes ~2.66 MB entry; Batch 171 lazy public research routes further reduces entry. ISS-017 |
| LOV-03 | Vercel Edge **middleware runtime deprecated** | **Deferred** | `middleware.ts` uses `@vercel/functions/next`; no platform mandate to change. ISS-018 |
| LOV-04 | **Browserslist** / caniuse-lite stale | **Implemented / code mitigated** | PR #170 `update-browserslist-db`. ISS-019 |
| LOV-05 | Vite **>500 kB** chunk warning | **Still unresolved** (acceptable) | Entry chunk remains >500 kB after splits; warning is informational, not suppressed. ISS-017 |
| LOV-06 | Production **`chat`** not on recovered analyst delivery | **Still unresolved** (blocked) | Git has delivery at `10723434`; previous Edge version id not captured for rollback. **ISS-015** |
| LOV-07 | **Live RTH scanner** acceptance not signed off | **Runtime acceptance pending** | Contracts/tests green (#169); Monday **2026-10-26 ET** runbook. ISS-020 |
| LOV-08 | Polygon snapshot **`day.v=0`** ranked as verified zero | **Implemented / code mitigated** | `polygonSnapshotVolume()` on `main` (#169); batch27 tests |
| LOV-09 | Production **Supabase Edge revision** unknown vs git | **Still unresolved** | Not read from Lovable Cloud this batch. ISS-003 (Edge) |
| LOV-10 | **`@modelcontextprotocol/sdk`** via `@lovable.dev/mcp-js` (high) | **Deferred** | Build/MCP codegen only; pin `0.20.0` by policy; await Lovable MCP release |

**Preserved (not defects):** Gate I.3 SEC activation (ISS-004 historical); Fly radar worker **v45** parity PASS (ISS-003 Fly).
