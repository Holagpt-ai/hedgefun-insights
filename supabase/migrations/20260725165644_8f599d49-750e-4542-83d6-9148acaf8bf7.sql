ALTER TABLE public.catalyst_user_state
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.catalyst_user_state
  DROP COLUMN IF EXISTS dismissed_at,
  DROP COLUMN IF EXISTS read_at;