
DROP POLICY IF EXISTS "public read watchlist_ai_alerts" ON public.watchlist_ai_alerts;
DROP POLICY IF EXISTS "public read watchlist_ai_analysis" ON public.watchlist_ai_analysis;

REVOKE SELECT ON public.watchlist_ai_alerts FROM anon;
REVOKE SELECT ON public.watchlist_ai_analysis FROM anon;
GRANT SELECT ON public.watchlist_ai_alerts TO authenticated;
GRANT SELECT ON public.watchlist_ai_analysis TO authenticated;

CREATE POLICY "Authenticated users read watchlist_ai_alerts"
  ON public.watchlist_ai_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read watchlist_ai_analysis"
  ON public.watchlist_ai_analysis FOR SELECT TO authenticated USING (true);
