# Catalyst Calendar V4 — production activation (Lovable Cloud only)

**Do not** run `supabase db push` or apply-all-pending from Cursor. Apply **only** the migrations listed below, in order, with owner approval.

## 1. Migrations (SQL order)

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `20261126180000_economic_events_calendar.sql` | `economic_events` table + public read |
| 2 | `20261126220000_catalyst_events_public_calendar_read_v1.sql` | Revoke anon `catalyst_events` SELECT |
| 3 | `20261126230000_economic_sync_status_v1.sql` | Sync coverage singleton |
| 4 | `20261126240000_public_catalyst_calendar_pagination_v1.sql` | Paginated `public_catalyst_calendar_range_v1` JSON RPC |

**Compatibility:** Do **not** re-grant anon `SELECT` on `catalyst_events`. Authenticated Catalyst Intelligence continues to use direct table reads under existing RLS.

## 2. Transactional apply (bounded)

- One transaction per file, `statement_timeout = '120s'`.
- After apply, confirm `REVOKE SELECT ON public.catalyst_events FROM anon` and RPC `GRANT EXECUTE` to `anon, authenticated`.

## 3. Access verification (read-only)

**Anonymous**

- `SELECT public.public_catalyst_calendar_range_v1('2026-11-01', '2026-11-30', 500, 0)` returns JSON with `rows`, `total_count`, `coverage_incomplete`.
- Direct `SELECT` on `catalyst_events` as `anon` must **fail**.
- `economic_events` and `economic_sync_status` public read per migration policies.

**Authenticated**

- `useCatalystEvents`, summary counts, AI Analyst: direct `catalyst_events` (unchanged).
- Homepage and `/calendar`: RPC only.

## 4. Economic provider entitlement

1. Deploy `sync-economic-calendar` after merge.
2. **GET** (public): returns cached `economic_sync_status` + US catalog links — **does not call Finnhub**.
3. **POST** with `{"verify_only":true}` and `Authorization: Bearer <SYNC_SECRET or service role>` — Finnhub entitlement probe only.
4. Keep `FINNHUB_ECONOMIC_ENABLED` **false** until commercial redistribution is confirmed.
5. With Finnhub disabled, **POST** sync ingests **US government** schedules (BLS `current_year.htm` + Federal Reserve **monthly** newsevents pages) into `economic_events` (dates only — no fabricated values). Response includes `partial_coverage` / `sources_failed`; **502 + `ok: false`** when **all** sources fail (no `last_success_at` advance).
6. Set `FINNHUB_ECONOMIC_ENABLED=true` only after successful `verify_only` and owner sign-off.

## 5. Edge deploy

- Deploy **only** `sync-economic-calendar`.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SYNC_SECRET`, optional `FINNHUB_API_KEY`, optional `FINNHUB_ECONOMIC_ENABLED`.

## 6. Initial bounded sync

```http
POST /functions/v1/sync-economic-calendar
Authorization: Bearer <SYNC_SECRET or service role>
Content-Type: application/json

{"from":"2026-11-01","to":"2026-11-30"}
```

- Response must include `ok: true` and `sync_status_persisted` / updated `sync_status` on subsequent GET.
- If `sync_status_persist_failed` in logs, treat ingest as **failed** even when rows upserted.

## 7. Coverage verification

- Catalyst grid loads via paginated RPC; UI warns when `coverage_incomplete`.
- Macro: `never_synced` vs `empty_in_range` vs `ready`.
- US government path populates scheduled releases without Finnhub.

## 8. Recurring refresh

- Daily authorized POST (Finnhub off → US government; Finnhub on → Finnhub path).
- Monitor `economic_sync_status.last_error_class`.

## 9. Recovery

| Symptom | Action |
| --- | --- |
| Guest calendar empty | Apply migrations 2 + 4; verify RPC |
| `sync_status_persist_failed` | Fix RLS/grants on `economic_sync_status` |
| Finnhub 403 | Keep `FINNHUB_ECONOMIC_ENABLED` false; use US government POST |
| Summary counts work but calendar empty | Expected until RPC applied; counts use authenticated reads |

## 10. Out of scope

- Fly, scanner Edge, Layer C, historical worker, DNS, Vercel prod merge.