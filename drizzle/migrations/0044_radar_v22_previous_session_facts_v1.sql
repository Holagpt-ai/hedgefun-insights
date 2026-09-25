-- Persist verified previous-session facts on radar_v22_candidates.
-- Missing or non-positive values stay NULL. Neither column defaults to 0.

ALTER TABLE public.radar_v22_candidates
  ADD COLUMN IF NOT EXISTS previous_close numeric NULL,
  ADD COLUMN IF NOT EXISTS prior_session_volume numeric NULL;

ALTER TABLE public.radar_v22_candidates
  DROP CONSTRAINT IF EXISTS radar_v22_candidates_previous_close_positive;
ALTER TABLE public.radar_v22_candidates
  ADD CONSTRAINT radar_v22_candidates_previous_close_positive
  CHECK (previous_close IS NULL OR previous_close > 0);

ALTER TABLE public.radar_v22_candidates
  DROP CONSTRAINT IF EXISTS radar_v22_candidates_prior_session_volume_positive;
ALTER TABLE public.radar_v22_candidates
  ADD CONSTRAINT radar_v22_candidates_prior_session_volume_positive
  CHECK (prior_session_volume IS NULL OR prior_session_volume > 0);

COMMENT ON COLUMN public.radar_v22_candidates.previous_close IS
  'Previous regular-session close from day.c and the verified regular-session move. NULL when unverified or split-scale. Never 0.';
COMMENT ON COLUMN public.radar_v22_candidates.prior_session_volume IS
  'Verified volume from the immediately previous completed session (prevDay.v). NULL when unverified. Never 0.';