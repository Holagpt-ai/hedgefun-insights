# Batch 34 — Catalyst production activation sequence (plan)

**No ingestion, cron, or API purchases in Batch 34.** This document operationalizes Batch 29/30 infrastructure for human-gated rollout.

Reference: `batch29-catalyst-source-activation-plan.md`, `batch29-production-activation-runbook.md`, `batch08-lovable-handoff.md`.

---

## Global prerequisites

1. Intel migrations applied (`catalyst_events`, `catalyst_intel_sources`, writer RPCs).
2. Edge bundle with `_shared/catalyst-intelligence/*` deployed.
3. `SYNC_SECRET`, `SEC_USER_AGENT`, bot-level `CATALYST_INTEL_*_ENABLED` flags documented.
4. All sources **`enabled = false`** in prod before starting.

---

## Sequence

### Step 1 — SEC EDGAR filings

| Item | Detail |
|------|--------|
| Implementation | `sync-sec-edgar-filings`, SEC dedupe, `SEC_EDGAR_WRITE_ENABLED` gate |
| Migration | `20260907180000_sec_edgar_sync_state_v1.sql` |
| Dependencies | Edge deploy, service role for writer RPCs |
| Provenance | Accession-level dedupe; no synthetic filings |
| Activate | Dry run → single write smoke → enable source row → enable write flag |
| Rollback | `enabled=false`, `SEC_EDGAR_WRITE_ENABLED=false`, prior Edge bundle if needed |

### Step 2 — Company IR announcements

| Item | Detail |
|------|--------|
| Implementation | IR sync bot + adapter in `_shared/catalyst-intelligence` |
| Dependencies | IR allowlist / fetch credentials per env |
| Dedupe | URL + symbol + published_at fingerprint |
| Activate | Manual bot POST with allowlist; verify `sources_successful` |
| Rollback | Source kill switch + bot env false |

### Step 3 — Press releases (GlobeNewswire or approved provider)

| Item | Detail |
|------|--------|
| Implementation | News sync path; 304 continuation hardened in `source-fetch.ts` |
| Dependencies | Provider entitlement; no upgrade in Batch 34 |
| Dedupe | Provider id + dedupe_key |
| Activate | One symbol smoke → narrow allowlist → expand |
| Rollback | Disable source; circuit/backoff metadata clears storms |

### Step 4 — Scheduled corporate events

| Item | Detail |
|------|--------|
| Implementation | Calendar/events sync; earnings vs announced separation |
| Dependencies | Calendar source credentials |
| Client | Upcoming earnings must not display as completed announcements |
| Activate | After news path stable; verify Market Pulse / Watchlist disclaimers |
| Rollback | Source disable; no mass delete of checkpoint rows without ops review |

---

## Verification after each step

- Client surfaces: `verified` / `none` / `unavailable` / `pending` only — no fabricated catalysts.
- Watchlist uses platform context (Batch 34) for pending/unavailable copy.
- Partial provider failure does not wipe existing `catalyst_events`.
- HTTP 429 → backoff / circuit; no unbounded retries.
