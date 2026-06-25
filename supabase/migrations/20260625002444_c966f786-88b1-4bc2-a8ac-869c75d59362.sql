
-- Enable RLS on all game tables (writes happen only via service_role in edge functions, so no client write policies are added).

ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_config public read" ON public.game_config FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.game_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_seasons public read" ON public.game_seasons FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.game_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_leaderboard public read" ON public.game_leaderboard FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.game_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_portfolios owner read" ON public.game_portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.game_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_positions owner read" ON public.game_positions FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.game_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_trades owner read" ON public.game_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.game_season_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_season_results owner read" ON public.game_season_results FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Ensure grants are in place (RLS still gates row visibility)
GRANT SELECT ON public.game_config TO anon, authenticated;
GRANT SELECT ON public.game_seasons TO anon, authenticated;
GRANT SELECT ON public.game_leaderboard TO anon, authenticated;
GRANT SELECT ON public.game_portfolios TO authenticated;
GRANT SELECT ON public.game_positions TO authenticated;
GRANT SELECT ON public.game_trades TO authenticated;
GRANT SELECT ON public.game_season_results TO authenticated;
GRANT ALL ON public.game_config, public.game_seasons, public.game_leaderboard, public.game_portfolios, public.game_positions, public.game_trades, public.game_season_results TO service_role;
