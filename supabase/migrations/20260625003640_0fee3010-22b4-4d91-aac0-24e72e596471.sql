
DROP POLICY IF EXISTS "game_leaderboard public read" ON public.game_leaderboard;

CREATE POLICY "Users can view own leaderboard row"
  ON public.game_leaderboard FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE SELECT ON public.game_leaderboard FROM anon;

CREATE OR REPLACE VIEW public.game_leaderboard_public
WITH (security_invoker = on) AS
SELECT id, season_id, display_name, rank, total_value, total_pnl, pnl_pct, position_count, updated_at
FROM public.game_leaderboard;

GRANT SELECT ON public.game_leaderboard_public TO anon, authenticated;
