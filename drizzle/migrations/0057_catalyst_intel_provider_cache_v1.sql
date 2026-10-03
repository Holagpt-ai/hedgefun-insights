-- Service-only last-known-good cache for provider payloads such as the SEC company/ticker map.
-- One row per cache_key. A validated refresh replaces that row in a single upsert.
-- Concurrent successful refreshes last-write-wins. A failed refresh does not write.
-- This is not a Catalyst source execution lock, and it does not store Catalyst evidence.

CREATE TABLE IF NOT EXISTS public.catalyst_intel_provider_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalyst_intel_provider_cache IS
  'Service-only provider cache. Not exposed to the frontend. Historical Catalyst evidence is not stored here.';

REVOKE ALL ON public.catalyst_intel_provider_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalyst_intel_provider_cache TO service_role;

ALTER TABLE public.catalyst_intel_provider_cache ENABLE ROW LEVEL SECURITY;
