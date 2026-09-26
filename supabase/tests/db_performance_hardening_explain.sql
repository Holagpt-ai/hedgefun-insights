-- Manual EXPLAIN (ANALYZE, BUFFERS) templates — run against staging/production after migration.
-- Expect Index Scan / Bitmap Index Scan on named indexes; not Seq Scan on large tables.

-- Catalyst AM/brief window
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, symbol, event_date, title
FROM public.catalyst_events
WHERE verification_state = 'provider_reported'
  AND event_date >= CURRENT_DATE - 7
  AND event_date <= CURRENT_DATE
ORDER BY event_date DESC
LIMIT 400;

-- Catalyst scanner enrich (symbol + published_at)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, symbol, published_at, title
FROM public.catalyst_events
WHERE symbol = 'AAPL'
  AND verification_state = 'provider_reported'
ORDER BY published_at DESC NULLS LAST
LIMIT 12;

-- Daily brief lookup
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM public.daily_briefs
WHERE brief_type = 'am' AND brief_date = CURRENT_DATE;

-- Earnings watchlist horizon
EXPLAIN (ANALYZE, BUFFERS)
SELECT report_date FROM public.earnings_calendar
WHERE symbol = 'AAPL'
  AND report_date >= CURRENT_DATE
  AND report_date <= CURRENT_DATE + 30
ORDER BY report_date ASC
LIMIT 1;

-- Screener PM leaders
EXPLAIN (ANALYZE, BUFFERS)
SELECT symbol, volume FROM public.screener_results
WHERE tab_id = 'day_trade_radar'
ORDER BY volume DESC NULLS LAST
LIMIT 24;

-- Prior-session closed radar snapshot
EXPLAIN (ANALYZE, BUFFERS)
SELECT symbol, session_volume FROM public.radar_v22_closed_snapshot
WHERE trading_date = CURRENT_DATE - 1
  AND snapshot_kind = 'closed_session'
ORDER BY session_volume DESC NULLS LAST
LIMIT 24;

-- Continuation handoffs (brief enrichment pattern)
EXPLAIN (ANALYZE, BUFFERS)
SELECT symbol, source_timestamp FROM public.late_session_continuation_handoffs
WHERE valid_from_session_date <= CURRENT_DATE
  AND valid_through_session_date >= CURRENT_DATE
ORDER BY source_timestamp DESC
LIMIT 40;

-- Active handoffs RPC equivalent
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.late_session_handoff_list_active_v1(CURRENT_DATE);
