
-- game_leaderboard: allow public read of all rankings
DROP POLICY IF EXISTS "Users can view own leaderboard row" ON public.game_leaderboard;
CREATE POLICY "Public can view leaderboard"
  ON public.game_leaderboard
  FOR SELECT
  TO anon, authenticated
  USING (true);
GRANT SELECT ON public.game_leaderboard TO anon;

-- game_season_results: allow public read of final rankings, but hide prize columns
DROP POLICY IF EXISTS "game_season_results owner read" ON public.game_season_results;
CREATE POLICY "Public can view season results"
  ON public.game_season_results
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Column-level: revoke SELECT then re-grant only non-prize columns to anon/authenticated
REVOKE SELECT ON public.game_season_results FROM anon;
REVOKE SELECT ON public.game_season_results FROM authenticated;
GRANT SELECT (id, season_id, user_id, display_name, final_rank, final_total_value, final_pnl, final_pnl_pct, created_at)
  ON public.game_season_results TO anon, authenticated;
-- service_role retains full access (bypasses RLS anyway) for edge functions handling prize logic
GRANT ALL ON public.game_season_results TO service_role;
