-- Intraday Participation Intelligence V1 + consolidated Radar Event Engine V1 columns (#1+#2 schema).
-- Deploy with 20260926130200_scanner_intelligence_stack_replace_rpc_v1.sql (RPC).
ALTER TABLE public.radar_v22_candidates
  ADD COLUMN IF NOT EXISTS promotion_reason jsonb,
  ADD COLUMN IF NOT EXISTS radar_event_lifecycle text,
  ADD COLUMN IF NOT EXISTS radar_engine_events jsonb,
  ADD COLUMN IF NOT EXISTS time_adjusted_rvol numeric,
  ADD COLUMN IF NOT EXISTS volume_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_15m numeric,
  ADD COLUMN IF NOT EXISTS volume_60m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_15m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_60m numeric,
  ADD COLUMN IF NOT EXISTS dollar_volume_velocity_5m numeric,
  ADD COLUMN IF NOT EXISTS participation_state text,
  ADD COLUMN IF NOT EXISTS participation_baseline_session_count integer,
  ADD COLUMN IF NOT EXISTS participation_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_source_as_of timestamptz;

ALTER TABLE public.radar_v22_closed_snapshot
  ADD COLUMN IF NOT EXISTS promotion_reason jsonb,
  ADD COLUMN IF NOT EXISTS radar_event_lifecycle text,
  ADD COLUMN IF NOT EXISTS radar_engine_events jsonb,
  ADD COLUMN IF NOT EXISTS time_adjusted_rvol numeric,
  ADD COLUMN IF NOT EXISTS volume_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_15m numeric,
  ADD COLUMN IF NOT EXISTS volume_60m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_15m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity_60m numeric,
  ADD COLUMN IF NOT EXISTS dollar_volume_velocity_5m numeric,
  ADD COLUMN IF NOT EXISTS participation_state text,
  ADD COLUMN IF NOT EXISTS participation_baseline_session_count integer,
  ADD COLUMN IF NOT EXISTS participation_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_source_as_of timestamptz;

ALTER TABLE public.radar_v22_events
  DROP CONSTRAINT IF EXISTS radar_v22_events_type_check;

ALTER TABLE public.radar_v22_events
  ADD CONSTRAINT radar_v22_events_type_check
  CHECK (event_type IN (
    'PROMOTED', 'DETECTED', 'CONFIRMED', 'ACTIVE', 'COOLING', 'REACTIVATED',
    'ARCHIVED', 'NEW_HOD', 'HOD_BREAK', 'HOD_REJECTION',
    'VWAP_RECLAIM', 'VWAP_LOSS',
    'VOLUME_100K', 'VOLUME_500K', 'VOLUME_1M',
    'MOMENTUM_TRIGGER', 'RE_ACCELERATION', 'PULLBACK', 'SECOND_LEG',
    'HALT', 'RESUME',
    'SESSION_PM_RTH', 'SESSION_RTH_AH'
  ));
