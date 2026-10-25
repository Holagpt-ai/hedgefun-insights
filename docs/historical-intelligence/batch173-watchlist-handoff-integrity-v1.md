# Batch 173 — Watchlist & Historical Handoff Integrity V1

**Base:** `main` after PR **#172** (`93a3c35d`). Client-only; no Edge deploy, migrations, or scanner changes.

## Corrected handoff defects

| Gap | Fix |
| --- | --- |
| Repeat Mover context could be written to session under a symbol key that did not match `currentSymbol` / `securityId` | `repeatMoverContextMatchesHandoff` gates persist, preload reads, and AI Analyst preloaded path |
| Compact workflow cache could enrich requests when `securityId` disagreed | Reuse shared `historicalWorkflowMatchesRequest` (same rules as late-session inbox) in `resolveWorkflowHistoricalContext` |
| Radar batch merge attached coerced context when bridge `currentSymbol` disagreed with the row symbol | Drop context; surface `historicalContextLoadStatus: unavailable` (not confirmed empty history) |
| Analyst historical fetch could fall back to the first batch row when the requested symbol was absent | Require exact symbol match in batch results |

## Preserved evidence fields (unchanged contract)

Episode counts and sample quality, movement / RVOL, comparable episodes, continuation rates, forward outcomes, linked catalyst events (temporal only), intraday reconstruction, session dates, security id, and causation guardrails in `HistoricalMemoryFacts`.

## Still open (runtime / ops)

- Intel → `public.catalyst_events` upsert remains deferred (Batch 172 metadata lands on `catalyst_intel_*` until activation).
- **ISS-015** — production `chat` Edge not on recovered catalyst delivery.
- **Batch 174** — Monday scanner live acceptance (read-only).
