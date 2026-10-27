# Batch 187 Edge Release Preflight — Read-only Findings

Lovable source: `e2898ccf` (forward-sync of main `d86e0c69`, PR #190). Nothing was changed, invoked, or deployed.

Access limit: my Cloud tools can deploy functions and read recent runtime logs. They cannot list deployed revisions, versions, deploy times, or download deployed code. So revision IDs and code alignment are **UNKNOWN** for all three functions. I did not guess them from the repo, preview, or database.

## Matrix

| Function | Deployed exists | Revision / version / deployed at | Evidence | Aligned with PR #190 | Batch 187 role |
|---|---|---|---|---|---|
| get-pre-market-workspace | UNKNOWN (no recent logs) | UNKNOWN | Log query returned no entries | UNKNOWN | **Required** for UI ranking (calendar fetch, market-impact ranking, truncation flags, verified activity) |
| sync-earnings-finnhub | UNKNOWN (no recent logs) | UNKNOWN | Log query returned no entries | UNKNOWN | Optional; separately authorized timing activation (unknown hour stored as empty, not "during") |
| sync-catalyst-events | YES | UNKNOWN (no ID in logs) | Runtime log 2026-10-27 21:30:03 UTC: `OK earnings_read=2042 news_read=100 validated=2259 upserted=2259 rejected=4` | UNKNOWN (log doesn't show whether `timing_unspecified` is set) | Optional; separately authorized timing activation |

Overall: **UNKNOWN**. Nothing is proven MISSING and nothing is proven MATCH.

## Suggested controlled deployment order (each needs separate authorization)

1. `get-pre-market-workspace` (required for Batch 187 ranking), then a signed-in check of the AM Inbox earnings order.
2. Timing activation, only if authorized: `sync-earnings-finnhub`, then `sync-catalyst-events`. No rewrites of past rows or replayed migrations.
3. Vercel frontend release for the AM Inbox card fields (handled outside Lovable).
4. Do not deploy `mcp` or any other function.

## Blockers

- No way to read deployed revision IDs or deployed source through the available Cloud tools, so the "confirm live revision before deploy" step in the release notes can't be done.
- Without the current revision IDs, I can't name a rollback target before deploying.
