-- Mirror of supabase/migrations/20260926200000_db_performance_hardening_v1.sql

CREATE UNIQUE INDEX IF NOT EXISTS daily_briefs_type_date_uidx
  ON public.daily_briefs (brief_type, brief_date);

CREATE INDEX IF NOT EXISTS catalyst_events_verified_event_date_idx
  ON public.catalyst_events (event_date DESC)
  WHERE verification_state = 'provider_reported';

CREATE INDEX IF NOT EXISTS catalyst_events_symbol_verified_published_idx
  ON public.catalyst_events (symbol, published_at DESC NULLS LAST)
  WHERE verification_state = 'provider_reported';

CREATE INDEX IF NOT EXISTS earnings_calendar_symbol_report_date_idx
  ON public.earnings_calendar (symbol, report_date);

CREATE INDEX IF NOT EXISTS earnings_calendar_report_date_idx
  ON public.earnings_calendar (report_date);

CREATE INDEX IF NOT EXISTS screener_results_tab_id_volume_idx
  ON public.screener_results (tab_id, volume DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS radar_v22_closed_snapshot_date_kind_volume_idx
  ON public.radar_v22_closed_snapshot (trading_date, snapshot_kind, session_volume DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS radar_v22_events_symbol_event_at_idx
  ON public.radar_v22_events (symbol, event_at DESC);

CREATE INDEX IF NOT EXISTS radar_v22_events_trading_session_event_at_idx
  ON public.radar_v22_events (trading_date, session_kind, event_at DESC);

CREATE INDEX IF NOT EXISTS late_session_handoffs_window_source_ts_idx
  ON public.late_session_continuation_handoffs (
    valid_from_session_date,
    valid_through_session_date,
    source_timestamp DESC
  );

CREATE INDEX IF NOT EXISTS late_session_handoffs_valid_through_idx
  ON public.late_session_continuation_handoffs (valid_through_session_date);

ANALYZE public.daily_briefs;
ANALYZE public.catalyst_events;
ANALYZE public.earnings_calendar;
ANALYZE public.screener_results;
ANALYZE public.radar_v22_closed_snapshot;
ANALYZE public.radar_v22_events;
ANALYZE public.late_session_continuation_handoffs;
