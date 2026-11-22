# ISS-024 Layer C — production activation (Lovable Cloud)

**GitHub `main` (merged):** `15aef76e3bc22650a6ccbd0286fb9d4cf3ab1017` (PR **#259**)  
**Parent (pre–Layer C Edge/SQL rollback provenance):** `53a0ee4c5775f5f69c41164fffb74441cb8c9bf5`  
**Migration (single file):** `supabase/migrations/20261116153000_screener_sync_generation_tab_evidence_v1.sql`  
**Edge function:** `sync-screener-data` only (PR **#259** did **not** change handler source; deploy for **provenance / integration parity**, not a ranking change)  
**Fly Radar worker:** **no change** — **v50** live (Nov 18); preserve deployed worker for ISS-044 **20:00 ET** acceptance (independent of Layer C; rollback **v49** owner-only)

**Cursor did not apply SQL, deploy Edge, or change cron/secrets.**

---

## Verdict gate

| Gate | Requirement |
| --- | --- |
| **Pre-flight read-only** | Owner runs §1 in Lovable — migration **absent**, columns absent, RPCs pre–Layer C |
| **Quiescent window** | No active staged generation in `chunking` / `finalizing` with live lease (§3) |
| **Integration sync** | Lovable project contains `15aef76e` (or later `main`) before apply/deploy |
| **Rollback package recorded** | Platform Edge version id **if exposed** + Git SHA `53a0ee4c` noted **before** deploy (§5) |

Until pre-flight passes: **BLOCKED** for production writes.  
After pre-flight passes: execute **§4** in order.

---

## 1. Pre-flight — confirm migration NOT applied (read-only)

Run in Lovable Cloud → SQL (read-only) on project `zcjptaolpumhtlwhlemq`.

### 1a. Migration ledger

```sql
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20261116153000';
```

**Proceed only if:** **0 rows**.  
Also check Lovable **Database → Migrations** UI for `20261116153000` / `screener_sync_generation_tab_evidence`.

If **already applied**, stop — run §6 verification only; do **not** re-apply.

### 1b. Job columns (defense in depth)

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'screener_sync_generation_jobs'
  AND column_name IN (
    'tab_evaluation_evidence',
    'published_synced_at',
    'published_nhl_baseline_status'
  );
```

**Proceed only if:** **0 rows**.

### 1c. Live RPC signature / behavior (before Layer C)

```sql
SELECT pg_get_functiondef(p.oid) LIKE '%tab_evaluation_evidence IS NOT NULL%'
       AS complete_requires_job_evidence
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'complete_screener_sync_publish_v1';
```

**Pre–Layer C:** `complete_requires_job_evidence` should be **`f`** (false).

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'assert_screener_tab_evaluation_evidence_v1'
) AS assert_fn_exists;
```

**Pre–Layer C:** `assert_fn_exists` should be **`f`** (false).

### 1d. Deployed `sync-screener-data` (Lovable UI)

Record from Lovable → Edge Functions → `sync-screener-data`:

- Last deploy **timestamp**
- **Version id** (if shown)
- **Source / integration SHA** Lovable reports (compare to `15aef76e` — **unknown equivalence** until recorded)

**Compatibility:** Handler on `main` already passes `p_tab_evaluation_evidence` with six-tab `buildTabEvaluationEvidence` / chunk path. Layer C is **RPC + job columns**. Stale Edge that omits or sends `{}` will **fail closed** at publish after SQL apply.

**Historical note:** Last **repo-recorded** scanner Edge deploy was Batch **228** (Nov **12**, Git `caefbe6b5…`); platform version id was **unavailable**. Treat live Edge as **UNKNOWN** until §1d is filled in.

---

## 2. Scope — what this activation changes

| Component | Changes |
| --- | --- |
| Postgres | Columns on `screener_sync_generation_jobs`; `assert_screener_tab_evaluation_evidence_v1`; stricter `publish_screener_sync_staged_generation_v1`, `complete_screener_sync_publish_v1`, `reconcile_screener_sync_staged_publish_v1` |
| Edge `sync-screener-data` | **No handler diff** in PR #259; redeploy optional for alignment with `main` |
| Cron `sync-screener-every-5min` | **Unchanged** |
| Fly worker | **Unchanged** (v49) |
| Frontend / Vercel | **Unchanged** |

Pre-migration `published` jobs keep `tab_evaluation_evidence IS NULL` — Layer C **unavailable** for those rows (documented).

---

## 3. Safe timing — avoid interrupting publication

Cron invokes `sync-screener-data` **every 5 minutes** during the scanner schedule. Apply SQL and Edge deploy **between** invocations when **no** in-flight generation holds work.

```sql
SELECT id, status, next_chunk_index, total_chunks,
       lease_expires_at, finalize_lease_expires_at,
       publish_rows_inserted, continue_last_error, updated_at
FROM public.screener_sync_generation_jobs
WHERE status IN ('chunking', 'finalizing')
ORDER BY updated_at DESC
LIMIT 5;
```

**Preferred windows:**

- Weekday **after** a successful `published` job and **before** the next cron tick, or
- **Closed session** when Batch **215** session gate is active (if deployed) — cleanup still runs; still avoid mid-`finalizing` with `publish_rows_inserted` set.

**Do not** apply migration in the middle of **09:28–09:35 ET** RTH open finalize unless explicitly accepted (ISS-034 risk).

If a job is `finalizing` with `publish_rows_inserted IS NOT NULL` and `status <> published`, **wait** — reconcile may complete it; do not deploy SQL mid-transaction.

---

## 4. Release order (owner / Lovable only)

1. Complete **§1** and **§3**; append results to `docs/DEPLOYMENT_STATUS.md` or batch handoff.
2. **Apply migration** `20261116153000_screener_sync_generation_tab_evidence_v1.sql` via Lovable Cloud (forward-only; one file).
3. **Post-SQL verify** (read-only):

```sql
-- Post-apply: assert exists
SELECT proname FROM pg_proc
WHERE proname = 'assert_screener_tab_evaluation_evidence_v1';

-- Post-apply: complete gates on job evidence
SELECT pg_get_functiondef(p.oid) LIKE '%tab_evaluation_evidence IS NOT NULL%'
FROM pg_proc p
WHERE proname = 'complete_screener_sync_publish_v1';
```

4. **Deploy Edge:** `sync-screener-data` only, from Lovable integration containing Git `15aef76e` (or current `main`). Record platform version id + timestamp.
5. **Smoke:** `OPTIONS` on `/functions/v1/sync-screener-data` → **200**.
6. **First-publication verification** — wait for the **next natural** `published` job (do not force cron). Then:

```sql
SELECT id, sync_run_id, status, publish_rows_inserted,
       tab_evaluation_evidence IS NOT NULL AS has_layer_c_evidence,
       tab_evaluation_evidence -> 'gappers' ->> 'status' AS gappers_status,
       tab_evaluation_evidence -> 'new_highs_lows' ->> 'status' AS nhl_status,
       created_at
FROM public.screener_sync_generation_jobs
WHERE status = 'published'
ORDER BY created_at DESC
LIMIT 5;
```

**Pass:** newest post-activation row has `has_layer_c_evidence = true` and six tab keys in `tab_evaluation_evidence` (statuses may be `evaluated`, `prerequisite_unavailable`, or NHL `not_evaluated` per policy). Match `sync_run_id` to `screener_feed_state` when that job is live.

Full runbook: `docs/release/batch191-layer-c-tab-evidence-v1.md`.

---

## 5. Rollback and forward recovery

### Edge rollback (provenance — not binary restore)

Per `docs/release/edge-function-release-lovable.md` and Batch **228** precedent:

- **Do not assume** the previous deployed Edge binary is recoverable.
- **Rollback action:** Lovable **redeploy** `sync-screener-data` from approved Git **`53a0ee4c5775f5f69c41164fffb74441cb8c9bf5`** (parent of Layer C merge). That triggers a **new** platform revision; it is **not** a bit-identical restore.
- Capture **before** deploy: any Lovable **version id** + timestamp; if unavailable, record the gap (ISS-039).

**Important:** After Layer C SQL is applied, Edge-only rollback to `53a0ee4c` does **not** revert database RPCs. Live behavior stays **Layer C RPCs** until a **forward SQL** migration restores prior function bodies (emergency only — not prepared in this batch).

### SQL “rollback”

**Do not** drop columns or hand-edit RPCs in production. Forward-fix only:

- If publish fails with assert / `tab_evaluation_evidence` errors: confirm Edge sends six-tab evidence (redeploy `15aef76e`); inspect `continue_last_error` / `finalize_stage:*` on failing job.
- If generation stuck `finalizing` with `publish_rows_inserted` set: use existing **reconcile** / lease-release paths (unchanged operator playbooks — Batch **190**).
- If a code defect is confirmed in Layer C SQL: ship a **new forward migration** on `main`; do not remove `20261116153000` from ledger.

### Fail-closed behavior (expected)

- Invalid / partial evidence → publish RPC **raises** or rejects; **feed unchanged** for that generation.
- `complete_screener_sync_publish_v1` without job evidence → `publish_complete_rejected`; job remains `finalizing` until retry/reconcile.

---

## 6. ISS-024 / ISS-044 coordination

| Track | Action |
| --- | --- |
| **ISS-024 Layer C** | This activation only (SQL + optional Edge record) |
| **ISS-044** | Fly worker **v49** — **no** redeploy as part of Layer C; weekday **20:00 ET** park acceptance remains separate |
| **ISS-034** | Scanner open-window behavior unchanged by Layer C; observe next RTH open after activation |

Do not merge Layer C activation with Fly worker or Radar bridge deploys in one change window.

---

## Lovable operator checklist (copy/paste)

- [ ] §1 pre-flight: migration **not** applied; columns absent; `complete_requires_job_evidence = f`
- [ ] §1d: record current `sync-screener-data` deploy metadata
- [ ] §3: no blocking `chunking`/`finalizing` jobs
- [ ] Apply `20261116153000` once
- [ ] Post-SQL verify assert + complete gate
- [ ] Deploy `sync-screener-data` from `15aef76e` integration; record version id
- [ ] OPTIONS smoke **200**
- [ ] First natural `published` job: `has_layer_c_evidence = true`
- [ ] Update `docs/DEPLOYMENT_STATUS.md`, close Layer C **source** gate in `ISSUE_REGISTER` (Layer D UI still open)