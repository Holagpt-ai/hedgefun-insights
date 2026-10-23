# Gate H rollback — SEC V1C attribution invalidation

Rollback restores allowlisted rows from `attribution_invalidated` → `provider_reported` using the audit trail. **No DELETE.**

## Preconditions

- Original apply completed with known `batch_id` from `apply_sec_v1c_attribution_invalidation` JSON
- Migration `20261023103000_sec_v1c_attribution_remediation_v1.sql` present

## Dry-run rollback

```sql
SELECT public.rollback_sec_v1c_attribution_invalidation(
  '<batch_id>'::uuid,
  true
);
```

Expect `would_rollback` equal to the number of invalidate audit rows for that batch; `rolled_back` = 0.

## Apply rollback

```sql
SELECT public.rollback_sec_v1c_attribution_invalidation(
  '<batch_id>'::uuid,
  false
);
```

Effects per row:

- `verification_state` → previous value (`provider_reported`)
- Removes `facts.attribution_remediation` key (provenance patch only)
- Inserts audit rows with `action = 'rollback'`

## Verification

```sql
SELECT dedupe_key, verification_state, facts->'attribution_remediation' AS remediation
FROM public.catalyst_events
WHERE dedupe_key = ANY(
  SELECT dedupe_key FROM public.sec_v1c_remediation_audit WHERE batch_id = '<batch_id>'
);
```

Legitimate rows that were never invalidated must remain `provider_reported`.

## Checkpoint

`sec_edgar_sync_state` is **not** modified by apply or rollback.
