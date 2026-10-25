# Lovable scanner reliability warnings (historical)

These are the original ten Lovable scanner, workflow, and market-data warnings. They are **not** the October 24 npm, bundle, middleware, or Browserslist findings. Those stay on **ISS-015 through ISS-019** and the release notes linked from `docs/ISSUE_REGISTER.md`.

**Code on `main` is not production sign-off.** Live scanner acceptance remains **Monday, 2026-10-26 ET** (Batch 174) per `docs/release/monday-scanner-acceptance-2026-10-26.md`. Inbox continuation observation is Batch 175. None of the rows below are marked production-resolved.

| # | Subject | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | Charts and quotes exhausted by site-wide request quotas | **Mitigated** | Shared live cache and cache-before-quota on `main` (PR #151 `e22a8361`, PR #152 `d8d68231`; `docs/release/batch37-market-data-capacity.md`). Production `market-data` revision and Upstash were not re-checked in this correction. |
| 2 | Radar historical context unavailable when the board exceeds 20 symbols | **Fixed in code** | Progressive 20-symbol batches (`src/lib/radar/radar-historical-context-bounds.ts`, Batch 28.3). `src/lib/__tests__/batch37-market-data-capacity.test.ts` covers boards above 20. Live board behavior is still inside Monday acceptance, not closed here. |
| 3 | Database statement timeouts and failed radar persistence | **Mitigated** | Timeout migration `20261020143000_radar_v22_replace_rpc_statement_timeout_v1.sql` and bounded V2 event publish (Batch 06R) are in git. Batch 34 records production apply of that migration as **unknown**. |
| 4 | Radar historical detail stripped before AI Analyst handoff | **Fixed in code** | Handoff keeps historical fields (`radar-historical-handoff`, Batch 34 regression tests). Production `chat` deploy is a separate gate (**ISS-015**) and is not treated as done. |
| 5 | Quiet-feed watchdog incorrectly selecting delayed feed | **Fixed in code; live acceptance pending** | Session-aware watchdog correction is in git. Monday, 2026-10-26 ET feed-state verification still applies. |
| 6 | Five-minute volume-history downloads allegedly blocking scanner publishing | **Disproven** | Batch 28.1 decoupled publish from enrichment. Batch 37 re-checked publish independence from 5-minute historical enrichment and found no remaining source defect. |
| 7 | AI Analyst losing symbol context on general questions | **Unresolved / Deferred to final AI Analyst regression cleanup** | PR #164 catalyst attribution guards do not prove that a general question keeps its stock context. **ISS-015** remains only the Edge deploy blocker for the recovered `chat` function. |
| 8 | Continuation RVOL scoring missing its baseline | **Fixed in code** | `continuation-rvol-confidence.ts` propagates baseline volume and sample size (Batch 34 tests). Live RVOL labeling is a Monday evidence row, not a claim that scoring already passed in RTH. |
| 9 | AM Inbox hiding qualified continuation candidates | **Fixed in code** | Qualified fallback when the priority pool is empty (Batch 06R `LateSessionHandoffsList` and AM inbox regression tests). Batch 34’s production checkbox for that UI was not re-run. Batch 175 covers inbox acceptance. |
| 10 | Stale price-alert toasts replaying on dashboard reload | **Fixed in code** | Session and durable seen sets in `src/lib/price-alerts/toast-delivery.ts` (Batch 14 and Batch 34 tests, including reload integrity). Not re-checked against a live dashboard reload in this correction. |

## Not on the active development backlog

Items 2, 4, 6, 8, 9, and 10 do not need another implementation batch from the evidence above. Item 5 stays off the implementation backlog and still needs Monday feed-state verification. Item 7 stays on the deferred AI Analyst regression cleanup, separate from ISS-015. Items 1 and 3 stay **mitigated** until a read-only production check (Edge `market-data` / migration ledger), not a new feature batch.

Monday, 2026-10-26 ET remains the live-session boundary for scanner acceptance. It does not reopen these ten as unimplemented work.
