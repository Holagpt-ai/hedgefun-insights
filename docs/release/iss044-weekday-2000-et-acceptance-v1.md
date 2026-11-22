# ISS-044 — weekday 20:00 ET closed-session park acceptance (read-only)

**Base:** GitHub `main` `30ea54bc4e8913f10443187bb9ed5853bef21932` (includes PR **#257** closed-park retry + Fly **v50**, Nov 18 deploy).  
**Scope:** Natural-session **observation only**. **No** Fly/SQL/Edge redeploy, cron, or secret changes from Cursor.

## Worker state (preserved)

| Field | Value |
| --- | --- |
| App | `stocksist-radar-v22-worker` |
| Live image | `deployment-01M7QXBMQERTR1FCQZVCT4V00M` (Fly **v50**, Nov 18 ~18:06 UTC) |
| Rollback reference | **v49** `deployment-01M7JK8SMFV0RP648PH6VBDN4G` — owner authorization required; do **not** auto-rollback |
| Bridge timeout | `timeout_ms=130000` in sampled post-deploy logs |

Nov 22 read-only query: `radar_v22_closed_snapshot` count **0** — acceptance **not** established; zero alone does not identify root cause.

## Pass criteria (all required on one eligible weekday)

1. **Time:** First **20:00 ET** boundary after observation start on a weekday with eligible V2 candidates in memory or feed.
2. **Park commit:** At least one `radar_v22_closed_snapshot` row with `snapshot_kind = 'closed_session'`, non-empty candidate payload when board had eligible names at park time.
3. **Session label:** `radar_v22_feed_state.session_kind` transitions to **`closed`** (or documented closed equivalent) after park completes — not stuck on **`after-hours`** for the new surveillance date.
4. **No AH replay:** After closed stage, worker does not republish the prior after-hours board as the current session.
5. **ISS-049 separation:** Statement cancellations / `persist_failed` correlate separately; screener `sync-screener-data` publish health is independent.

## Read-only SQL (Lovable Cloud; ET date `YYYY-MM-DD`)

```sql
-- Closed snapshot rows for surveillance date
SELECT id, snapshot_kind, surveillance_date, created_at
FROM radar_v22_closed_snapshot
WHERE surveillance_date = 'YYYY-MM-DD'::date
ORDER BY created_at DESC
LIMIT 5;

-- Feed session after ~20:05 ET
SELECT session_kind, v2_synced_at, updated_at
FROM radar_v22_feed_state
WHERE state_key = 'current';

-- Candidate count at park (same surveillance date)
SELECT count(*) FROM radar_v22_candidates
WHERE surveillance_date = 'YYYY-MM-DD'::date;
```

## Fly logs (owner; optional)

- Filter `publish_candidates_v2` / `closed` / `park` around **20:00–20:05 ET**.
- Confirm `isClosedParkFullyCommitted` path (PR **#257**) — no single-attempt drop without retry.

## Fail / escalate

| Observation | Action |
| --- | --- |
| Park retries then success | **PASS** if SQL shows committed closed snapshot |
| Park succeeds, feed still `after-hours` next morning | Open UI/session-label defect — **not** ISS-049 |
| Zero snapshot with eligible candidates + no park log line | Capture Fly logs; **no** redeploy without new evidence |
| Worker restart after 20:00 with empty engine | Known cold-start limitation (no DB rehydrate in git); document; do not hot-fix without approved RPC |

## Related runbooks

- `docs/release/batch219-radar-v2-recovery-v1.md`
- `docs/release/stocksist-session-handoff-2026-11-22.md` § ISS-044