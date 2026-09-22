-- Historical Corporate Event / Catalyst Linkage V1
-- Reuses corporate_events + event_reaction_links (security_id keyed, non-causal).

CREATE TABLE IF NOT EXISTS public.corporate_events (
  event_id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  observed_symbol text,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  title text NOT NULL,
  summary text,
  source text,
  source_url text,
  provider_event_id text,
  accession_id text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_events_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT corporate_events_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT corporate_events_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

ALTER TABLE public.corporate_events
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz NOT NULL DEFAULT now();

UPDATE public.corporate_events
SET published_at = event_at
WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_reaction_links (
  link_id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.corporate_events (event_id),
  episode_id uuid NOT NULL REFERENCES public.market_behavior_episodes (episode_id),
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  relation_type text NOT NULL,
  time_delta_seconds integer,
  time_delta_minutes integer,
  confidence numeric,
  evidence text,
  provenance text NOT NULL,
  source text,
  source_as_of timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reaction_links_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS event_reaction_links_episode_event_uidx
  ON public.event_reaction_links (episode_id, event_id);

CREATE UNIQUE INDEX IF NOT EXISTS corporate_events_provider_event_uidx
  ON public.corporate_events (source, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND source IS NOT NULL;

CREATE INDEX IF NOT EXISTS corporate_events_security_event_at_idx
  ON public.corporate_events (security_id, event_at);

CREATE INDEX IF NOT EXISTS event_reaction_links_episode_id_idx
  ON public.event_reaction_links (episode_id);

ALTER TABLE public.corporate_events DROP CONSTRAINT IF EXISTS corporate_events_type_check;
ALTER TABLE public.corporate_events
  ADD CONSTRAINT corporate_events_type_check
  CHECK (event_type IN (
    'EARNINGS', 'GUIDANCE', 'PRESS_RELEASE', 'SEC_FILING', 'INSIDER_BUY', 'INSIDER_SELL',
    'OFFERING', 'FINANCING', 'M_AND_A', 'ACQUISITION', 'PARTNERSHIP', 'CONTRACT', 'ORDER',
    'FDA_EVENT', 'CLINICAL_EVENT', 'PRODUCT_EVENT', 'PATENT', 'AI_ANNOUNCEMENT',
    'CRYPTO_ANNOUNCEMENT', 'MANAGEMENT_HIRE', 'MANAGEMENT_DEPARTURE', 'SPLIT', 'REVERSE_SPLIT',
    'SHAREHOLDER_MEETING', 'INVESTOR_CONFERENCE', 'DIVIDEND', 'BUYBACK', 'LITIGATION',
    'REGULATORY_EVENT', 'EXCHANGE_COMPLIANCE', 'OWNERSHIP_CHANGE',
    'ANALYST_ACTION', 'BANKRUPTCY', 'CORPORATE_ACTION', 'UNKNOWN', 'OTHER'
  ));

ALTER TABLE public.event_reaction_links DROP CONSTRAINT IF EXISTS event_reaction_links_relation_check;
ALTER TABLE public.event_reaction_links
  ADD CONSTRAINT event_reaction_links_relation_check
  CHECK (relation_type IN (
    'SAME_WINDOW', 'PRECEDES_EPISODE', 'OVERLAPS_EPISODE', 'FOLLOWS_EPISODE', 'UNKNOWN_RELATIONSHIP'
  ));

COMMENT ON TABLE public.corporate_events IS
  'Canonical corporate event memory keyed by security_id. Storage does not assert market causation.';
COMMENT ON TABLE public.event_reaction_links IS
  'Temporal evidence links between corporate events and behavior episodes. Non-causal.';

ALTER TABLE public.corporate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reaction_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.corporate_event_apply_batch_v1(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  applied integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.corporate_events (
      event_id, security_id, observed_symbol, event_type, event_at, published_at,
      title, summary, source, source_url, provider_event_id, accession_id,
      source_as_of, fetched_at, computed_at, quality, freshness, provenance, metadata, created_at, ingested_at
    )
    VALUES (
      (item->>'event_id')::uuid,
      (item->>'security_id')::uuid,
      nullif(item->>'observed_symbol', ''),
      item->>'event_type',
      (item->>'event_at')::timestamptz,
      coalesce((item->>'published_at')::timestamptz, (item->>'event_at')::timestamptz),
      item->>'title',
      nullif(item->>'summary', ''),
      nullif(item->>'source', ''),
      nullif(item->>'source_url', ''),
      nullif(item->>'provider_event_id', ''),
      nullif(item->>'accession_id', ''),
      nullif(item->>'source_as_of', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz,
      nullif(item->>'computed_at', '')::timestamptz,
      coalesce(nullif(item->>'quality', ''), 'DERIVED'),
      coalesce(nullif(item->>'freshness', ''), 'UNKNOWN'),
      coalesce(nullif(item->>'provenance', ''), 'PROVIDER'),
      item->'metadata',
      coalesce((item->>'created_at')::timestamptz, now()),
      coalesce((item->>'ingested_at')::timestamptz, now())
    )
    ON CONFLICT (event_id) DO UPDATE SET
      observed_symbol = excluded.observed_symbol,
      event_type = excluded.event_type,
      event_at = excluded.event_at,
      published_at = excluded.published_at,
      title = excluded.title,
      summary = excluded.summary,
      source = excluded.source,
      source_url = excluded.source_url,
      provider_event_id = excluded.provider_event_id,
      accession_id = excluded.accession_id,
      source_as_of = excluded.source_as_of,
      fetched_at = excluded.fetched_at,
      computed_at = excluded.computed_at,
      quality = excluded.quality,
      freshness = excluded.freshness,
      provenance = excluded.provenance,
      metadata = excluded.metadata,
      ingested_at = excluded.ingested_at;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('applied', applied);
END;
$$;

CREATE OR REPLACE FUNCTION public.event_reaction_link_apply_batch_v1(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  applied integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.event_reaction_links (
      link_id, event_id, episode_id, security_id, relation_type,
      time_delta_seconds, time_delta_minutes, confidence, evidence,
      provenance, source, source_as_of, created_at
    )
    VALUES (
      coalesce((item->>'link_id')::uuid, gen_random_uuid()),
      (item->>'event_id')::uuid,
      (item->>'episode_id')::uuid,
      (item->>'security_id')::uuid,
      item->>'relation_type',
      nullif(item->>'time_delta_seconds', '')::integer,
      nullif(item->>'time_delta_minutes', '')::integer,
      null,
      nullif(item->>'evidence', ''),
      coalesce(nullif(item->>'provenance', ''), 'DERIVED'),
      nullif(item->>'source', ''),
      nullif(item->>'source_as_of', '')::timestamptz,
      coalesce((item->>'created_at')::timestamptz, now())
    )
    ON CONFLICT (episode_id, event_id) DO UPDATE SET
      relation_type = excluded.relation_type,
      time_delta_seconds = excluded.time_delta_seconds,
      time_delta_minutes = excluded.time_delta_minutes,
      evidence = excluded.evidence,
      provenance = excluded.provenance,
      source = excluded.source,
      source_as_of = excluded.source_as_of;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('applied', applied);
END;
$$;

DROP FUNCTION IF EXISTS public.corporate_event_list_for_security_v1(uuid, timestamptz, integer);
CREATE OR REPLACE FUNCTION public.corporate_event_list_for_security_v1(
  p_security_id uuid,
  p_after_event_at timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS SETOF public.corporate_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.corporate_events
  WHERE security_id = p_security_id
    AND (p_after_event_at IS NULL OR event_at > p_after_event_at)
  ORDER BY event_at ASC, event_id ASC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

DROP FUNCTION IF EXISTS public.event_reaction_link_list_for_episodes_v1(uuid[]);
CREATE OR REPLACE FUNCTION public.event_reaction_link_list_for_episodes_v1(p_episode_ids uuid[])
RETURNS TABLE (
  link_id uuid,
  event_id uuid,
  episode_id uuid,
  security_id uuid,
  relation_type text,
  time_delta_seconds integer,
  time_delta_minutes integer,
  evidence text,
  provenance text,
  source text,
  source_as_of timestamptz,
  created_at timestamptz,
  event_type text,
  event_at timestamptz,
  published_at timestamptz,
  title text,
  event_source text,
  source_url text,
  provider_event_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.link_id,
    l.event_id,
    l.episode_id,
    l.security_id,
    l.relation_type,
    l.time_delta_seconds,
    l.time_delta_minutes,
    l.evidence,
    l.provenance,
    l.source,
    l.source_as_of,
    l.created_at,
    e.event_type,
    e.event_at,
    e.published_at,
    e.title,
    e.source AS event_source,
    e.source_url,
    e.provider_event_id
  FROM public.event_reaction_links l
  JOIN public.corporate_events e ON e.event_id = l.event_id
  WHERE l.episode_id = ANY (p_episode_ids)
  ORDER BY l.episode_id, l.relation_type, l.time_delta_seconds NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.corporate_event_apply_batch_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_reaction_link_apply_batch_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.corporate_event_list_for_security_v1(uuid, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_reaction_link_list_for_episodes_v1(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.corporate_event_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_reaction_link_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.corporate_event_list_for_security_v1(uuid, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_reaction_link_list_for_episodes_v1(uuid[]) TO service_role;