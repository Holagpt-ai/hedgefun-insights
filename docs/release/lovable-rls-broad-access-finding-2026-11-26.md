# Lovable RLS finding — broad access (Nov 26, 2026)

**Reported during:** Catalyst Calendar V4 production activation attempt (post PR **#278** merge `5d458699`).

**Lovable summary:** Critical — “Some access rules let everyone through.” **Affected tables: 28** (exact inventory **not** exported to git in this batch).

**Owner instruction for this recovery PR:** Do **not** run Lovable **Fix All**. Do **not** change unrelated policies while landing calendar corrective migrations.

## Classification framework (pending owner + Lovable export)

| Class | Intent | Calendar recovery action |
| --- | --- | --- |
| A — Intentional public market-data read | Guest or authenticated read of published screener/radar/catalyst projections | **No change** in calendar recovery PR |
| B — Service-role operational writes | Edge sync, cron, worker upserts | **Verify grants** for calendar tables only (`economic_*`) |
| C — Private authenticated user data | Journal, watchlist, billing, profile | **Out of scope**; must not regress |
| D — Unauthorized anon or cross-user write | INSERT/UPDATE/DELETE open to `anon` or `USING (true)` on private rows | **Separate critical blocker** if evidenced on private data |

## Evidence status

- **28-table list:** **Pending** — request full export from Lovable (table name, policy name, `USING` / `WITH CHECK`, roles).
- **False positive dismissal:** **Not authorized** without per-policy evidence.
- **Private-data unauthorized access:** **Not confirmed** in this recovery batch.

## Relationship to calendar activation

Missing `service_role` **table** grants on `economic_events` / `economic_sync_status` were a **confirmed** calendar blocker (Edge upsert path). That is addressed in migration `20261126250000_economic_calendar_service_role_grants_v1.sql`.

The 28-table finding is **tracked separately** until classified. Scanner **v530**, Radar **v50**, Option B **ON**, Layer C, and historical worker suspension are **unchanged**.