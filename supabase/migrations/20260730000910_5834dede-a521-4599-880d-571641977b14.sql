-- SCREENERS P1-R2A: enforce read-only public feed-state access.

REVOKE ALL ON TABLE public.screener_feed_state FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_feed_state FROM anon;
REVOKE ALL ON TABLE public.screener_feed_state FROM authenticated;

GRANT SELECT ON TABLE public.screener_feed_state TO anon, authenticated;
GRANT ALL ON TABLE public.screener_feed_state TO service_role;