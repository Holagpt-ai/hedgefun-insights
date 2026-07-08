DROP POLICY IF EXISTS "Public can view season results" ON public.game_season_results;
CREATE POLICY "Users can view own season results"
  ON public.game_season_results
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);