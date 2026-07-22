-- Tighten V2 grants (project has legacy wide public-schema defaults)
REVOKE ALL ON public.watchlist_analysis_v2 FROM anon, authenticated;
REVOKE ALL ON public.watchlist_analysis_history FROM anon, authenticated;
REVOKE ALL ON public.watchlist_alerts_v2 FROM anon, authenticated;
REVOKE ALL ON public.watchlist_rvol_baseline FROM anon, authenticated;
REVOKE ALL ON public.watchlist_analysis_runs FROM anon, authenticated;

GRANT SELECT ON public.watchlist_analysis_v2 TO authenticated;
GRANT SELECT ON public.watchlist_analysis_history TO authenticated;
GRANT SELECT ON public.watchlist_alerts_v2 TO authenticated;