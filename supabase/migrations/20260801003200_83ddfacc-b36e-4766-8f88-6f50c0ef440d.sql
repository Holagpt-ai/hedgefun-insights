-- 1. Leaderboard: remove anonymous read access
DROP POLICY IF EXISTS "Public can view leaderboard" ON public.game_leaderboard;

CREATE POLICY "Authenticated users can view leaderboard"
ON public.game_leaderboard
FOR SELECT
TO authenticated
USING (true);

REVOKE ALL ON public.game_leaderboard FROM anon;
GRANT SELECT ON public.game_leaderboard TO authenticated;
GRANT ALL ON public.game_leaderboard TO service_role;

-- 2. Watchlists: harden the owner-only contract that five realtime tables depend on
REVOKE ALL ON public.watchlists FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT ALL ON public.watchlists TO service_role;

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists FORCE ROW LEVEL SECURITY;