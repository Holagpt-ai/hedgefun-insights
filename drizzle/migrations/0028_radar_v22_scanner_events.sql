-- Scanner Phase 2: RUNNING_UP / HOD_MOMENTUM / VOLUME_EXPLOSION event snapshots.

ALTER TABLE public.radar_v22_candidates
  ADD COLUMN IF NOT EXISTS primary_scanner_event text,
  ADD COLUMN IF NOT EXISTS primary_scanner_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanner_events jsonb;

COMMENT ON COLUMN public.radar_v22_candidates.primary_scanner_event IS
  'Highest-priority active scanner event type for Symbol/Signal display.';
COMMENT ON COLUMN public.radar_v22_candidates.primary_scanner_event_at IS
  'First-trigger timestamp for primary_scanner_event (event-time, not row updated_at).';
COMMENT ON COLUMN public.radar_v22_candidates.scanner_events IS
  'Active scanner events [{type, triggered_at, active}] for detail/handoff.';

-- Scanner Phase 1: 5m RVOL, volume velocity, volume acceleration (%).

ALTER TABLE public.radar_v22_candidates
  ADD COLUMN IF NOT EXISTS rvol_5m numeric,
  ADD COLUMN IF NOT EXISTS volume_velocity numeric,
  ADD COLUMN IF NOT EXISTS volume_acceleration_pct numeric;

COMMENT ON COLUMN public.radar_v22_candidates.rvol_5m IS
  'Regular-session 5m volume vs historical same time-of-day baseline; null when insufficient history.';
COMMENT ON COLUMN public.radar_v22_candidates.volume_velocity IS
  'Shares per minute over the latest 5-minute window.';
COMMENT ON COLUMN public.radar_v22_candidates.volume_acceleration_pct IS
  'Percent change in volume velocity vs the prior 5m window (distinct from acceleration_5m 60s ratio).';

NOTIFY pgrst, 'reload schema';