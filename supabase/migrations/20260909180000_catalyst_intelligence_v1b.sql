-- Catalyst Intelligence V1B additive columns and versioned identity.
-- Artifact only: created in-repo, not applied to production in this sprint.
-- Depends on 20260908180000_catalyst_intelligence_v1.sql.
-- Service-role only. No cron. No catalyst_events mutation. No SEC tables.

ALTER TABLE public.catalyst_intelligence
  ADD COLUMN IF NOT EXISTS rules_version text NOT NULL DEFAULT 'catalyst-intelligence-v1';

ALTER TABLE public.catalyst_intelligence
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'developing';

ALTER TABLE public.catalyst_intelligence
  ADD COLUMN IF NOT EXISTS evidence_as_of timestamptz;

ALTER TABLE public.catalyst_intelligence
  ADD COLUMN IF NOT EXISTS market_context_as_of timestamptz;

ALTER TABLE public.catalyst_intelligence
  DROP CONSTRAINT IF EXISTS catalyst_intelligence_lifecycle_check;

ALTER TABLE public.catalyst_intelligence
  ADD CONSTRAINT catalyst_intelligence_lifecycle_check
  CHECK (lifecycle IN ('scheduled', 'developing', 'confirmed', 'outcome', 'stale'));

ALTER TABLE public.catalyst_intelligence
  DROP CONSTRAINT IF EXISTS catalyst_intelligence_rules_version_nonempty_check;

ALTER TABLE public.catalyst_intelligence
  ADD CONSTRAINT catalyst_intelligence_rules_version_nonempty_check
  CHECK (length(btrim(rules_version)) > 0);

ALTER TABLE public.catalyst_intelligence
  DROP CONSTRAINT IF EXISTS catalyst_intelligence_source_dedupe_key_key;

ALTER TABLE public.catalyst_intelligence
  DROP CONSTRAINT IF EXISTS catalyst_intelligence_event_rules_key;

ALTER TABLE public.catalyst_intelligence
  ADD CONSTRAINT catalyst_intelligence_event_rules_key
  UNIQUE (source_event_id, rules_version);

COMMENT ON COLUMN public.catalyst_intelligence.rules_version IS
  'Deterministic rules identity. Same catalyst_event_id + rules_version is idempotent.';
COMMENT ON COLUMN public.catalyst_intelligence.lifecycle IS
  'Intelligence-layer state only. Does not mutate catalyst_events.';
COMMENT ON COLUMN public.catalyst_intelligence.evidence_as_of IS
  'When the evidence used for this Intelligence conclusion was observed.';
COMMENT ON COLUMN public.catalyst_intelligence.market_context_as_of IS
  'Optional market-context timestamp. Null when no market context exists.';

CREATE INDEX IF NOT EXISTS idx_catalyst_intelligence_rules_version
  ON public.catalyst_intelligence(rules_version);

ALTER TABLE public.catalyst_intelligence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM PUBLIC;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM anon;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM authenticated;
GRANT ALL ON TABLE public.catalyst_intelligence TO service_role;

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alert_events FROM PUBLIC;
REVOKE ALL ON TABLE public.alert_events FROM anon;
REVOKE ALL ON TABLE public.alert_events FROM authenticated;
GRANT ALL ON TABLE public.alert_events TO service_role;
