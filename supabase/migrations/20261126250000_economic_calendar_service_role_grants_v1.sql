-- Catalyst Calendar V4 — corrective forward migration (Lovable apply only).
-- Explicit service_role table privileges for sync-economic-calendar upserts.
-- Does not alter RLS policies or rewrite prior migration history.

-- economic_events: public read via RLS; writes via service_role + Edge sync only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.economic_events FROM anon, authenticated;
GRANT SELECT ON public.economic_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.economic_events TO service_role;

-- economic_sync_status: public read singleton; service_role upsert for coverage metadata.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.economic_sync_status FROM anon, authenticated;
GRANT SELECT ON public.economic_sync_status TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.economic_sync_status TO service_role;

COMMENT ON TABLE public.economic_events IS
  'US and global macro releases for Catalyst Calendar V4 (provider-synced; no fabricated values). '
  'service_role: SELECT/INSERT/UPDATE for Edge sync; anon/authenticated: SELECT only via RLS.';

COMMENT ON TABLE public.economic_sync_status IS
  'Singleton row describing last authorized economic calendar sync (coverage — not a substitute for release data). '
  'service_role: SELECT/INSERT/UPDATE for Edge sync; anon/authenticated: SELECT only via RLS.';