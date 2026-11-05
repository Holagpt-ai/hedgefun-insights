# Batch 191 / ISS-034 — Read-Only Edge Log Correlation Report

## Result: NOT VERIFIED for the target window (13:30–21:00 UTC / 08:30–16:00 ET) and the after-hours window (21:55–22:40 UTC / 16:55–17:40 ET)

What the available log tools returned:
- Log history query for function logs (13:30–22:45 UTC, matching continue_dispatch_failed, staged_finalize, CPU Time, 546, prior_generation_retained, published): **0 rows**. A plain count over both function log tables also returned 0 rows, so this route returns nothing for this project. That means no access. It does not mean no events happened.
- Native recent-log viewer for sync-screener-data only returns the most recent entries, all after 23:00 UTC. Searches for "546" and "CPU Time" found **no matches** in that recent buffer.

## Verified log entries (outside the requested windows, shown for completeness only)

| UTC | ET | generation / run | stage / error | interpretation | evidence |
|---|---|---|---|---|---|
| 23:00:40–41 | 18:00:40–41 | gen 131ac29c-8a76-49e2-87ac-82c9ad83db07 / run 3ceab335-eb10-452e-b803-0ba1c26d7961 | atomic_publish exit rows_inserted=86; complete_publish exit detail=published; timing claim_finalize_lease 1813 ms, load_volume_baselines 1306 ms | Successful staged publication | staged_finalize_stage_exit / staged_finalize_timing lines |
| 23:00:41 | 18:00:41 | not in log line | continue_dispatch_failed action=finalize error=Signal timed out. | The self-continuation call to finalize timed out, in the same second the 131ac29c publication finished. The log line has no ID, so it can't be tied to that job. Cause NOT determined. | `INFO [sync-screener-data] continue_dispatch_failed action=finalize error=Signal timed out.` |
| 23:05:41–43 | 18:05:41–43 | gen 996c674c-dd2c-494b-930e-3ac66c24eafe / run 1ba1e24e-415b-49e6-be9d-8be67e35877c | merge_selections (gl_universe=42, gl_selected=5) → build_rows rows=86 → preserve_check publish_candidate → atomic_publish rows_inserted=86 → complete_publish published | Successful staged publication. Recovered after the 23:00:41 dispatch timeout. | staged_finalize_stage_enter/exit + timing lines |

The 09:30 ET and 15:35 ET HTTP 546 / CPU Time exceeded events, and any matching continue_dispatch_failed or prior_generation_retained log lines, could **not** be matched to log entries. No root cause is claimed.

## How to view the target window in Lovable
1. Open the project in Lovable, then click **Cloud** (View Backend) in the top bar.
2. Go to **Edge Functions** and select **sync-screener-data**.
3. Open the **Logs** tab and set the time range to Nov 5, 2026 13:25–21:05 UTC. Then set it to 21:50–22:45 UTC for after-hours.
4. Search each of these in turn: `CPU Time`, `546`, `continue_dispatch_failed`, `staged_finalize_stage`, `prior_generation_retained`. Copy the generation_id and sync_run_id from the matching lines.
5. If older entries have aged out, the window is past the log retention period. In that case only the database records you already have remain.

## Change and action status
- Files changed: none. This report file is the only thing written, as plan mode requires.
- Production actions: none. No deploy, migration, SQL write, secret or cron change, function call or publish.
- ISS-034 remains OPEN.
