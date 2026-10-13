-- Historical Intelligence V1 marker (Supabase source: 20261013180000_historical_intelligence_post_momentum_forward_v1.sql)

ALTER TABLE public.episode_intraday_reconstruction
  ADD COLUMN IF NOT EXISTS post_momentum_forward_outcomes jsonb;
