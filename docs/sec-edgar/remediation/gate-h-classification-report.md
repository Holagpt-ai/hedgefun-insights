# Gate H — classification report (evidence)

**Status:** Classifier prepared in repo; **production counts pending** approved DB run.

## Method

Deterministic replay of Attribution Integrity V1 rules (`sec-filing-attribution.ts`) via `sec-v1c-historical-classification.ts`:

| Outcome | Rule |
| --- | --- |
| **confirmed_misattribution** | Resolver would **not** attribute this `symbol` (issuer-level multi-ticker, wrong preferred/structured fan-out, explicit-evidence mismatch) |
| **legitimate** | Resolver selects this `symbol` for the stored filing metadata |
| **unresolved** | Missing `cik`/`form_type`, dedupe/accession mismatch, symbol absent from current CIK map — **no allowlist entry** |

No synthetic filing text is invented; classification uses stored `facts` and `company_name` only.

## Expected production workflow

1. Run `scripts/ops/sec-v1c-misattribution-classify.deno.ts` with approved URL.
2. Commit or attach generated `gate-h-classification-report.json` to the release ticket.
3. Ops sign-off on allowlist row count vs. pre-V1 fan-out estimate (~95).

## Proposed affected-row count (pre-execution)

| Metric | Value |
| --- | --- |
| **Exact invalidation target** | **`would_apply` from remediate dry-run after classify** — populate after step 1 |
| Prior estimate (V1 doc) | ~95 CIK fan-out rows |
| Unresolved (manual queue) | From `sec-v1c-unresolved-candidates.csv` after classify |

Until the classifier runs against production, treat **`would_apply` on default dry-run** as the authoritative proposed count for approval.

## Fixture-backed expectations (tests)

| Scenario | Confirmed misattribution |
| --- | --- |
| UBS 424B2 × 3 listings | 3 rows |
| Citigroup 10-Q preferred `C-PJ` | 1 row (common `C` legitimate) |
| 424B2 with `(NYSE: UBS^I)` | `UBS` row only |

See `sec-v1c-historical-classification_test.ts`.
