-- DB Performance Hardening V1 — additive indexes for hot read paths only.
-- Query evidence: edge functions generate-daily-brief, get-pre-market-workspace,
-- analyze-watchlist-tickers-v2, sync-catalyst-events, enrich-and-persist (catalyst),
-- client useCatalystEvents; RPC late_session_handoff_list_active_v1 / expire_stale_v1.
-- No RPC/table semantics changes. Run ANALYZE on affected tables after deploy.

-- Daily brief canonical row (brief_type + brief_date) — insert conflict handling expects uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS daily_briefs_type_date_uidx
  ON public.daily_briefs (brief_type, brief_date);

-- Catalyst: verified feed scans by event_date (brief, pre-market workspace).
CREATE INDEX IF NOT EXISTS catalyst_events_verified_event_date_idx
  ON public.catalyst_events (event_date DESC)
  WHERE verification_state = 'provider_reported';

-- Catalyst: per-symbol strongest verified row (scanner enrich, symbol-scoped UI).
CREATE INDEX IF NOT EXISTS catalyst_events_symbol_verified_published_idx
  ON public.catalyst_events (symbol, published_at DESC NULLS LAST)
  WHERE verification_state = 'provider_reported';

-- Earnings: symbol + upcoming window (watchlist V2).
CREATE INDEX IF NOT EXISTS earnings_calendar_symbol_report_date_idx
  ON public.earnings_calendar (symbol, report_date);

-- Earnings: date-range ingest (sync-catalyst-events, sync-earnings).
CREATE INDEX IF NOT EXISTS earnings_calendar_report_date_idx
  ON public.earnings_calendar (report_date);

-- Screener tab leaders ordered by volume (pre-market workspace, AM brief enrichment).
CREATE INDEX IF NOT EXISTS screener_results_tab_id_volume_idx
  ON public.screener_results (tab_id, volume DESC NULLS LAST);

-- Closed radar snapshot for prior session (AM brief) — filter date/kind, sort volume.
CREATE INDEX IF NOT EXISTS radar_v22_closed_snapshot_date_kind_volume_idx
  ON public.radar_v22_closed_snapshot (trading_date, snapshot_kind, session_volume DESC NULLS LAST);

-- Radar events: symbol timeline + purge retention (event_at) already indexed.
CREATE INDEX IF NOT EXISTS radar_v22_events_symbol_event_at_idx
  ON public.radar_v22_events (symbol, event_at DESC);

CREATE INDEX IF NOT EXISTS radar_v22_events_trading_session_event_at_idx
  ON public.radar_v22_events (trading_date, session_kind, event_at DESC);

-- Continuation handoffs: AM inbox window overlap + ordering by source_timestamp.
CREATE INDEX IF NOT EXISTS late_session_handoffs_window_source_ts_idx
  ON public.late_session_continuation_handoffs (
    valid_from_session_date,
    valid_through_session_date,
    source_timestamp DESC
  );

-- Expire stale handoffs (valid_through_session_date < p_as_of).
CREATE INDEX IF NOT EXISTS late_session_handoffs_valid_through_idx
  ON public.late_session_continuation_handoffs (valid_through_session_date);

COMMENT ON INDEX public.catalyst_events_verified_event_date_idx IS
  'Hot path: verification_state=provider_reported AND event_date range ORDER BY event_date DESC.';

ANALYZE public.daily_briefs;
ANALYZE public.catalyst_events;
ANALYZE public.earnings_calendar;
ANALYZE public.screener_results;
ANALYZE public.radar_v22_closed_snapshot;
ANALYZE public.radar_v22_events;
ANALYZE public.late_session_continuation_handoffs;
