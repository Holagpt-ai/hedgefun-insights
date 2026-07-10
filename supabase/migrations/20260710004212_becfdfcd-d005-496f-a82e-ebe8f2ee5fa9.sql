
-- 1. New restricted table for invite codes
CREATE TABLE public.game_season_invite_codes (
  season_id uuid PRIMARY KEY REFERENCES public.game_seasons(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only service_role can access invite codes; no anon/authenticated grants.
GRANT ALL ON public.game_season_invite_codes TO service_role;

ALTER TABLE public.game_season_invite_codes ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated → RLS denies all client reads/writes.
-- Service role bypasses RLS, so edge functions using service_role can still
-- validate invite codes server-side.

-- 2. Migrate existing invite codes over
INSERT INTO public.game_season_invite_codes (season_id, invite_code)
SELECT id, invite_code
FROM public.game_seasons
WHERE invite_code IS NOT NULL;

-- 3. Remove the publicly readable column from game_seasons
ALTER TABLE public.game_seasons DROP COLUMN invite_code;
