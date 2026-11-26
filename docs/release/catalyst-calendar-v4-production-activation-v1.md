# Catalyst Calendar V4 — production activation (Lovable Cloud only)

**Do not** run `supabase db push` or apply-all-pending from Cursor. Apply **only** the migrations listed below, in order, with owner approval.

## 1. Migrations (SQL order)

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `20261126180000_economic_events_calendar.sql` | `economic_events` table + public read |
| 2 | `20261126220000_catalyst_events_public_calendar_read_v1.sql` | `public_catalyst_calendar_range_v1` RPC (no anon table SELECT) |
| 3 | `20261126230000_economic_sync_status_v1.sql` | Sync coverage singleton |

**Compatibility:** Each file is idempotent where noted. Do **not** apply older broad anon `GRANT SELECT ON catalyst_events TO anon` policies.

## 2. Transactional apply (bounded)

- Use a single transaction per migration file with `statement_timeout = '120s'`.
- Verify ledger entry after each apply (production history may omit ledger rows — record owner attestation separately).

## 3. Access verification (read-only)

**Anonymous**

- `SELECT public.public_catalyst_calendar_range_v1('2026-11-01', '2026-11-30')` returns rows (no direct `catalyst_events` SELECT).
- `SELECT` from `economic_events` allowed when table exists.
- `SELECT` from `economic_sync_status` returns singleton.

**Authenticated**

- Existing `catalyst_events` authenticated policy unchanged for Catalyst Intelligence surfaces.
- Calendar homepage and `/calendar` use the **RPC** contract only.

## 4. Economic provider entitlement

1. Ensure `FINNHUB_API_KEY` is set in Lovable Edge secrets.
2. Deploy `sync-economic-calendar` from this PR branch after merge.
3. **GET** (no auth) on `sync-economic-calendar` runs `verifyFinnhubEconomicEntitlement` — review JSON before ingest.
4. Only after owner confirms entitlement, set `FINNHUB_ECONOMIC_ENABLED=true`.
5. If Finnhub is not entitled, keep flag **false**; UI shows `never_synced` / catalog links (BLS, BEA, Census, Federal Reserve) — no fabricated values.

## 5. Edge deploy

- Deploy **only** `sync-economic-calendar` (no other Edge functions in this batch).
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY`, optional `SYNC_SECRET`, optional `FINNHUB_ECONOMIC_ENABLED`.

## 6. Initial bounded sync

```http
POST /functions/v1/sync-economic-calendar
Authorization: Bearer <SYNC_SECRET or service role>
Content-Type: application/json

{"from":"2026-11-01","to":"2026-11-30"}
```

- Window max **60 days**; inverted ranges rejected.
- Confirm `economic_sync_status.last_success_at` updates.

## 7. Coverage verification

- `/calendar` macro filter: status not `never_synced` after successful sync.
- Empty month with valid sync → `empty_in_range` copy (not “no releases exist”).
- Catalyst month grid populates via RPC (guest).

## 8. Recurring refresh

- Owner cron or scheduled Lovable job: daily POST sync with default window (14d past / 45d future).
- Monitor `last_error_class` on `economic_sync_status`.

## 9. Recovery

| Symptom | Action |
| --- | --- |
| `403` on sync POST | Verify `SYNC_SECRET` or service role header |
| `provider_auth` | Finnhub key or entitlement; keep `FINNHUB_ECONOMIC_ENABLED` false until fixed |
| Guest calendar empty | Confirm RPC migration applied; do not re-grant anon table SELECT |
| Macro always `never_synced` | Run initial POST sync after migrations |

## 10. Out of scope

- Fly workers, scanner Edge, Layer C, historical worker, DNS, Vercel production merge (separate owner step).