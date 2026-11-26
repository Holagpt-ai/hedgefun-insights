# Catalyst Calendar V4 — production activation (Lovable Cloud only)

**GitHub `main`:** PR **#278** merged @ **`5d45869905cdf77c5abe9d85f7ab660214797417`** (Nov 26, 2026).

**Activation status:** Lovable attempted apply **Nov 26, 2026** and **stopped before changes** (ambiguous migration ledger history + missing `service_role` table grants on economic tables). **No** calendar migrations applied; **no** Edge deploy during that attempt (per Lovable).

**Do not** from Cursor or CI: `supabase db push`, apply-all-pending, ledger repair, blind replay, database reset, or production Edge deploy.

**Do not** let unrelated historical ledger gaps (Layer C direct SQL, AM Inbox ACL direct SQL, etc.) **automatically block** calendar apply when each calendar object is **independently verified** absent or matching git definitions below.

---

## 1. Migration execution sequence (exact order)

| Step | File | Purpose |
| --- | --- | --- |
| 1 | `20261126180000_economic_events_calendar.sql` | `economic_events` + RLS public read |
| 2 | `20261126220000_catalyst_events_public_calendar_read_v1.sql` | Revoke anon `catalyst_events` SELECT; baseline RPC |
| 3 | `20261126230000_economic_sync_status_v1.sql` | Sync coverage singleton |
| 4 | `20261126240000_public_catalyst_calendar_pagination_v1.sql` | Paginated JSON RPC + `ce.id` tie-breaker |
| 5 | `20261126250000_economic_calendar_service_role_grants_v1.sql` | **Corrective** — `service_role` SELECT/INSERT/UPDATE on economic tables |

**Five** files only. **No** other pending repo migrations in this activation.

### Required privileges after step 5

| Table | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `economic_events` | SELECT | SELECT | SELECT, INSERT, UPDATE |
| `economic_sync_status` | SELECT | SELECT | SELECT, INSERT, UPDATE |
| `catalyst_events` | **no** SELECT | per existing Catalyst Intelligence RLS | per existing ops grants |

RLS **stays enabled** on `economic_*` tables. **No** DELETE/TRUNCATE for `service_role` on economic tables (not required for upsert sync).

---

## 2. Per-migration state machine (before apply)

For **each** file above, classify production **before** executing:

| State | Meaning | Action |
| --- | --- | --- |
| **L0** | Ledger row exists **and** catalog matches git | **Skip** re-apply; run post-checks only |
| **L1** | Ledger row exists **but** catalog differs | **Stop** — document drift; owner decides repair (do not auto-replay) |
| **L2** | Ledger row **missing**, object **missing** | **Apply** file in bounded transaction |
| **L3** | Ledger row **missing**, object **exists** and matches git | **Do not** re-run DDL; **do not** fabricate ledger entry; record **executed outside ledger** in ops notes |
| **L4** | Ledger row **missing**, object **exists** and **differs** | **Stop** — manual reconcile; calendar-only forward fix if owner approves |

Historical discrepancies elsewhere (e.g. Layer C `20261116153000` applied direct SQL **outside** ledger) **do not** change L0–L4 for calendar files unless the **same** object is involved.

### 2.1 Ledger read (read-only)

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20261126%'
ORDER BY version;
```

### 2.2 Object fingerprint queries (read-only)

**Tables**

```sql
SELECT 'economic_events' AS obj, to_regclass('public.economic_events') IS NOT NULL AS exists;
SELECT 'economic_sync_status' AS obj, to_regclass('public.economic_sync_status') IS NOT NULL AS exists;
```

**Constraints (economic_events)**

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.economic_events'::regclass
  AND conname = 'economic_events_importance_check';
```

**RLS policies**

```sql
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('economic_events', 'economic_sync_status')
ORDER BY tablename, policyname;
```

Expect: `economic_events_public_read`, `economic_sync_status_public_read` — `SELECT` to `anon` / `authenticated`, `USING (true)`.

**Catalyst guest read**

```sql
SELECT has_table_privilege('anon', 'public.catalyst_events', 'SELECT') AS anon_catalyst_select;
```

Expect: **`f`** after migration 2+4.

**RPC (after migration 4)**

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'public_catalyst_calendar_range_v1';
```

Expect identity args: `p_from date, p_to date, p_limit integer, p_offset integer` and return type `jsonb`.

**Grants (after migration 5)**

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('economic_events', 'economic_sync_status')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;
```

Or:

```sql
SELECT has_table_privilege('service_role', 'public.economic_events', 'INSERT') AS sr_econ_ins;
SELECT has_table_privilege('service_role', 'public.economic_sync_status', 'UPDATE') AS sr_sync_upd;
```

### 2.3 Match criteria (L0 / L2 / L3)

- **Migration 1:** table + indexes + importance check + RLS policy name `economic_events_public_read`.
- **Migration 2:** `anon` lacks `SELECT` on `catalyst_events`; function exists (may be superseded by 4).
- **Migration 3:** singleton table + policy `economic_sync_status_public_read` + row `id = 1`.
- **Migration 4:** paginated RPC signature; `ORDER BY` includes `ce.id ASC`; `GRANT EXECUTE` to `anon, authenticated`.
- **Migration 5:** `service_role` has SELECT/INSERT/UPDATE on both economic tables; anon/auth lack INSERT/UPDATE/DELETE/TRUNCATE.

---

## 3. Bounded apply procedure (Lovable)

**Preconditions**

- Owner approval for **calendar-only** SQL.
- Read-only pass: document L0–L4 for all **five** files.
- `statement_timeout = '120s'` per transaction.
- **One transaction per file** when applying L2 states.

**Order**

1. Apply steps **1 → 4** only for files in **L2** (skip L0/L3 with evidence).
2. Apply step **5** when steps **1 and 3** are L0 or L3-verified (tables must exist).
3. **Never** apply full pending migration queue.

**Post-execution verification (same session)**

- Re-run §2.2 fingerprint queries.
- Run pgTAP file `supabase/tests/database/economic_calendar_privileges_v1.test.sql` when PostgreSQL test harness available.
- Deploy **only** `sync-economic-calendar` Edge (§5) after SQL succeeds.

**Compatibility:** Do **not** re-grant anon `SELECT` on `catalyst_events`. Authenticated Catalyst Intelligence keeps direct table reads under existing RLS.

---

## 4. Access verification (roles)

**Anonymous**

- `SELECT public.public_catalyst_calendar_range_v1('2026-11-01', '2026-11-30', 500, 0)` → JSON with `rows`, `total_count`, `coverage_incomplete`.
- Direct `SELECT` on `catalyst_events` → **permission denied**.
- `SELECT` on `economic_events` / `economic_sync_status` → **allowed** (read-only).
- `INSERT` / `UPDATE` on economic tables → **denied**.

**Authenticated**

- Catalyst Intelligence / `useCatalystEvents`: direct `catalyst_events` (**unchanged**).
- Homepage + `/calendar`: RPC only.
- `INSERT` / `UPDATE` on economic tables without service role → **denied**.

**Service role (Edge sync)**

- Upsert to `economic_events` and `economic_sync_status` → **succeeds** after migration 5.

---

## 5. Economic provider entitlement

1. Deploy `sync-economic-calendar` **after** SQL steps succeed.
2. **GET** (public): cached `economic_sync_status` + US catalog — **does not call Finnhub**.
3. **POST** with `{"verify_only":true}` and `Authorization: Bearer <SYNC_SECRET or service role>` — **Finnhub entitlement probe only** (not GET).
4. Keep `FINNHUB_ECONOMIC_ENABLED` **false** until commercial redistribution is confirmed.
5. With Finnhub disabled, **POST** sync ingests US government schedules into `economic_events`. Response may include `partial_coverage`; **502 + `ok: false`** when all sources fail.
6. Enable Finnhub only after successful `verify_only` and owner sign-off.

---

## 6. Edge deploy

- **Only** `sync-economic-calendar`.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SYNC_SECRET`, optional `FINNHUB_API_KEY`, optional `FINNHUB_ECONOMIC_ENABLED`.

---

## 7. Initial bounded sync

```http
POST /functions/v1/sync-economic-calendar
Authorization: Bearer <SYNC_SECRET or service role>
Content-Type: application/json

{"from":"2026-11-01","to":"2026-11-30"}
```

- Success: `ok: true`, `sync_status_persisted: true` on response; GET shows updated `sync_status`.
- `sync_status_persist_failed` in logs → treat as **failed** ingest even if rows partially upserted (usually missing migration **5**).

---

## 8. Lovable security finding (28 tables)

Lovable reported **Critical** — broad RLS / “everyone through” on **28** tables. **Do not Fix All** in this activation.

See `docs/release/lovable-rls-broad-access-finding-2026-11-26.md` for classification and pending inventory.

**Calendar recovery scope:** economic `service_role` grants only. **Broader RLS audit** is a **separate** workstream; if evidence shows unauthorized writes to **private user data**, treat as **critical release blocker** outside this PR.

---

## 9. Recovery

| Symptom | Action |
| --- | --- |
| Lovable stops on ledger ambiguity | Use §2 state machine; apply **five** calendar files individually |
| Guest calendar empty | Verify migrations 2 + 4; RPC EXECUTE |
| `sync_status_persist_failed` | Apply migration **5**; verify `service_role` INSERT/UPDATE |
| Finnhub 403 | Keep `FINNHUB_ECONOMIC_ENABLED` false; US government POST |
| Summary counts work, guest calendar empty | Expected until RPC applied |

---

## 10. Out of scope

- Fly, scanner Edge, Layer C replay, historical worker, DNS, Vercel prod merge, cron, secrets.
- **Preserved:** scanner **v530**, Radar **v50**, Option B **ON**, Layer C activated state, historical worker suspension.