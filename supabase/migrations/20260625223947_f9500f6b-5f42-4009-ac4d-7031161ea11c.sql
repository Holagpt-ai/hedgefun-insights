
DROP VIEW IF EXISTS public.game_leaderboard_public;

CREATE VIEW public.game_leaderboard_public
WITH (security_invoker = off) AS
SELECT
  id,
  season_id,
  display_name,
  rank,
  pnl_pct,
  position_count,
  updated_at
FROM public.game_leaderboard;

GRANT SELECT ON public.game_leaderboard_public TO anon, authenticated;
