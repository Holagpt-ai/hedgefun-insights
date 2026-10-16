# Batch 08 — Lovable Cloud handoff (catalyst source activation)

**Cursor PR only.** No production writes, cron, or secret rotation from this batch.

## Scope delivered in GitHub

- SEC intel adapter uses accession-anchor paging (`sec-intel-discovery.ts`) aligned with `walkLatestFilingsPages`.
- IR schedule-only vs announcement semantics (`ir-announcement-semantics.ts`).
- Evidence schedule conflict flagging + verification `CONFLICTING` path.
- SEC accession-aware event dedupe; routine Form 4 tier downgrade.
- NEWS_PR: block `source_ticker_hint` on market commentary headlines.

## Migrations — verify before enablement

| File | Purpose |
|------|---------|
| `20260907180000_sec_edgar_sync_state_v1.sql` | **Not applied per runbook** — required before `sync-sec-edgar-filings` write mode |
| `20260930120000_catalyst_intelligence_foundation_v1.sql` | Intel tables (confirm prod) |
| `20261003140000_catalyst_intel_provider_cache_v1.sql` | Provider cache (confirm prod) |
| `20261015180000_catalyst_intel_due_sources_news_continuation_v1.sql` | NEWS continuation due-sources (confirm prod) |

Do **not** apply SQL from Cursor. Use approved Supabase Cloud process only.

## Edge functions — deploy when approved (after PR merge)

| Function | When |
|----------|------|
| Catalyst intel bot entrypoints that bundle `_shared/catalyst-intelligence/*` | After code review (same bundle as existing catalyst sync jobs) |
| `sync-sec-edgar-filings` | Only per `docs/sec-edgar/activation-runbook.md` — **after** checkpoint migration |

No new Edge function names in this batch.

## Environment / gates (unchanged)

- `SEC_EDGAR_WRITE_ENABLED=false` until runbook step 9.
- `SEC_USER_AGENT` set before any SEC fetch in prod.
- Catalyst source `enabled` flags remain off until separately approved.

## Safe dry-run (SEC sync only)

```json
POST /functions/v1/sync-sec-edgar-filings
Authorization: Bearer <SYNC_SECRET>
{"mode":"dry_run"}
```

Inspect sanitized summary; do not enable writes in this batch.

## Controlled enablement sequence

1. Confirm intel migrations applied.
2. Deploy updated catalyst intel Edge bundle (if separate from app deploy path).
3. Apply `sec_edgar_sync_state` migration when approved.
4. Deploy `sync-sec-edgar-filings`; dry-run → single write → idempotency check (runbook).
5. Enable individual catalyst **sources** in registry one at a time with monitoring.
6. Cron for SEC sync remains **disabled** until post-sprint approval (`docs/sec-edgar/overlap-and-cadence.md`).

## Post-deploy verification (minimal)

- SEC intel source: checkpoint metadata advances; raw `(source_id, external_id)` dedupes by accession.
- NEWS source with backlog: continuation cursor drains; no duplicate raw rows.
- Sample event: verification state matches tier; commentary stays `UNVERIFIED` / low materiality.

## Rollback / disable

- Set source `enabled=false` in catalyst source registry.
- Set `SEC_EDGAR_WRITE_ENABLED=false`.
- Redeploy prior Edge bundle if needed; checkpoint rows are forward-only (do not delete without ops review).
