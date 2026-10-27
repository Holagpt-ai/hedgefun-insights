# Batch 185 — Lovable Cloud production verification (read-only)

**Do not apply migrations or deploy from this checklist alone.** Use it after PR **#187** merges to confirm what production already has before ordering remaining work.

## 1. Applied migration records

In Lovable Cloud → Supabase → **Database → Migrations** (or `supabase_migrations.schema_migrations`), confirm presence and order:

| Migration file (git) | Purpose |
| --- | --- |
| `20260914200000_screener_tab_evaluation_evidence_v1.sql` | `tab_evaluation_evidence` column + 5-arg `replace_screener_results_generation_v1` |
| `20260917180200_screener_rvol20d_results_rpc_v1.sql` | Supersedes RPC body (still 5-arg signature with evidence param) |

Later NHL/baseline migrations do **not** remove the evidence column; they extend RPC/rows. If `20260914200000` is **missing**, the 4-arg fallback path is expected until it is applied.

## 2. Column: `screener_feed_state.tab_evaluation_evidence`

Read-only SQL (service role / Lovable SQL editor):

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'screener_feed_state'
  AND column_name = 'tab_evaluation_evidence';
```

**Pass:** one `jsonb` column. **Fail:** no row → frontend publication reconcile only; Edge PATCH cannot persist evidence.

## 3. RPC signature

```sql
SELECT pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_screener_results_generation_v1';
```

**Pass:** includes `p_tab_evaluation_evidence jsonb DEFAULT NULL` (5-parameter form). **Fail:** only 3–4 parameters → sync will use legacy 4-arg call + PATCH (requires column + Edge deploy from Batch 185.1).

## 4. Edge deployment revision

In Lovable Cloud → Edge Functions → **`sync-screener-data`**:

- Note deployed git SHA / revision id.
- Compare to merged `main` containing Batch **185.1** handler (`persistTabEvaluationEvidenceAfterLegacyRpc`, response `tab_evaluation_evidence_persistence`).

**Pass:** revision includes 185.1 safety PATCH. **Fail:** older revision may omit guarded PATCH or return false success.

## 5. Current feed generation snapshot

```sql
SELECT
  state_key,
  sync_run_id,
  status,
  synced_at,
  rows_inserted,
  tab_counts,
  nhl_baseline_status,
  tab_evaluation_evidence IS NOT NULL AS has_evidence,
  jsonb_object_keys(tab_evaluation_evidence) AS evidence_tabs
FROM public.screener_feed_state
WHERE state_key = 'current';
```

Record for acceptance notes:

- `sync_run_id` / `synced_at` (Oct 27 ~08:15 ET reference: compare to UI screenshots)
- Per-tab counts in `tab_counts`
- Whether `tab_evaluation_evidence` is null while `rows_inserted > 0` (Batch 185 root symptom)

Optional row spot-check:

```sql
SELECT tab_id, count(*) AS published
FROM public.screener_results
GROUP BY tab_id
ORDER BY tab_id;
```

## 6. Required deployment order (remaining work)

1. **Apply missing migrations** (at minimum `20260914200000`, then `20260917180200` if not applied) via Lovable Cloud — only if step 1–3 show gaps.
2. **Deploy Edge** `sync-screener-data` from merged `main` (185.1 PATCH + persistence telemetry).
3. **Vercel** production deploy (publication-confirmed truth states + partial parse).
4. **Trigger one screener sync** (existing cron/ops — not from Cursor unless approved).
5. Re-run section 5 queries; expect `has_evidence = true` and provider `evaluated` payloads when 5-arg RPC succeeds.

## 7. Acceptance boundaries

- **Client-only (Vercel):** tabs with published rows may show **Published results** + advisory when evidence JSON is null; empty tabs (Gappers/G-L/NHL) remain **Evaluation evidence unavailable** until provider evidence is persisted.
- **Full fix:** 5-arg RPC + Edge deploy restores provider evaluation evidence; publication reconcile defers to persisted JSON when present.

**Production state for this document:** NOT VERIFIED in Cursor session — complete sections 1–5 in Lovable Cloud and attach results to PR **#187** or Session Handoff.
