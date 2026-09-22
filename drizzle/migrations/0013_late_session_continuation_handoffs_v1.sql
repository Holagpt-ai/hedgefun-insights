-- Late-Session / Day-Two handoffs for next-session AM Inbox (evidence only, not predictive).

CREATE TABLE IF NOT EXISTS public.late_session_continuation_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id uuid REFERENCES public.securities (security_id),
  symbol text NOT NULL,
  source_session_date date NOT NULL,
  source_timestamp timestamptz NOT NULL,
  source_category text NOT NULL,
  last_price numeric,
  session_move_pct numeric,
  volume bigint,
  rvol numeric,
  dollar_volume numeric,
  close_distance_from_hod_pct numeric,
  after_hours_extends boolean,
  catalyst_present boolean,
  float_turnover numeric,
  historical_context_available boolean NOT NULL DEFAULT false,
  evidence_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_size_quality text,
  comparable_episode_count integer,
  most_recent_comparable_date date,
  profile_freshness text NOT NULL DEFAULT 'UNKNOWN',
  valid_from_session_date date NOT NULL,
  valid_through_session_date date NOT NULL,
  capture_freshness_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT late_session_handoffs_category_check CHECK (
    source_category IN (
      'POWER_HOUR_MOMENTUM',
      'AFTER_HOURS_CONTINUATION',
      'STRONG_CLOSE_NEAR_HOD',
      'DAY_TWO_WATCH'
    )
  ),
  CONSTRAINT late_session_handoffs_symbol_session_category_key
    UNIQUE (symbol, source_session_date, source_category)
);

CREATE INDEX IF NOT EXISTS late_session_handoffs_valid_window_idx
  ON public.late_session_continuation_handoffs (valid_from_session_date, valid_through_session_date);

CREATE INDEX IF NOT EXISTS late_session_handoffs_source_session_idx
  ON public.late_session_continuation_handoffs (source_session_date DESC);

ALTER TABLE public.late_session_continuation_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY late_session_handoffs_select_authenticated
  ON public.late_session_continuation_handoffs
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.late_session_continuation_handoffs IS
  'Server-side late-session continuation handoffs for AM Inbox. Not a ranking or prediction store.';

CREATE OR REPLACE FUNCTION public.late_session_handoff_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'symbol', ''), '') = '' THEN
    RAISE EXCEPTION 'symbol is required';
  END IF;
  IF p_row->>'source_session_date' IS NULL OR p_row->>'source_category' IS NULL THEN
    RAISE EXCEPTION 'source_session_date and source_category are required';
  END IF;

  INSERT INTO public.late_session_continuation_handoffs (
    security_id,
    symbol,
    source_session_date,
    source_timestamp,
    source_category,
    last_price,
    session_move_pct,
    volume,
    rvol,
    dollar_volume,
    close_distance_from_hod_pct,
    after_hours_extends,
    catalyst_present,
    float_turnover,
    historical_context_available,
    evidence_labels,
    sample_size_quality,
    comparable_episode_count,
    most_recent_comparable_date,
    profile_freshness,
    valid_from_session_date,
    valid_through_session_date,
    capture_freshness_class,
    updated_at
  ) VALUES (
    nullif(p_row->>'security_id', '')::uuid,
    upper(trim(p_row->>'symbol')),
    (p_row->>'source_session_date')::date,
    (p_row->>'source_timestamp')::timestamptz,
    p_row->>'source_category',
    nullif(p_row->>'last_price', '')::numeric,
    nullif(p_row->>'session_move_pct', '')::numeric,
    nullif(p_row->>'volume', '')::bigint,
    nullif(p_row->>'rvol', '')::numeric,
    nullif(p_row->>'dollar_volume', '')::numeric,
    nullif(p_row->>'close_distance_from_hod_pct', '')::numeric,
    CASE
      WHEN p_row ? 'after_hours_extends' AND p_row->>'after_hours_extends' IS NOT NULL
        THEN (p_row->>'after_hours_extends')::boolean
      ELSE NULL
    END,
    CASE
      WHEN p_row ? 'catalyst_present' AND p_row->>'catalyst_present' IS NOT NULL
        THEN (p_row->>'catalyst_present')::boolean
      ELSE NULL
    END,
    nullif(p_row->>'float_turnover', '')::numeric,
    coalesce((p_row->>'historical_context_available')::boolean, false),
    coalesce(p_row->'evidence_labels', '[]'::jsonb),
    nullif(p_row->>'sample_size_quality', ''),
    nullif(p_row->>'comparable_episode_count', '')::integer,
    nullif(p_row->>'most_recent_comparable_date', '')::date,
    coalesce(nullif(p_row->>'profile_freshness', ''), 'UNKNOWN'),
    (p_row->>'valid_from_session_date')::date,
    (p_row->>'valid_through_session_date')::date,
    nullif(p_row->>'capture_freshness_class', ''),
    now()
  )
  ON CONFLICT (symbol, source_session_date, source_category) DO UPDATE SET
    security_id = coalesce(EXCLUDED.security_id, late_session_continuation_handoffs.security_id),
    source_timestamp = EXCLUDED.source_timestamp,
    last_price = EXCLUDED.last_price,
    session_move_pct = EXCLUDED.session_move_pct,
    volume = EXCLUDED.volume,
    rvol = EXCLUDED.rvol,
    dollar_volume = EXCLUDED.dollar_volume,
    close_distance_from_hod_pct = EXCLUDED.close_distance_from_hod_pct,
    after_hours_extends = EXCLUDED.after_hours_extends,
    catalyst_present = EXCLUDED.catalyst_present,
    float_turnover = EXCLUDED.float_turnover,
    historical_context_available = EXCLUDED.historical_context_available,
    evidence_labels = EXCLUDED.evidence_labels,
    sample_size_quality = EXCLUDED.sample_size_quality,
    comparable_episode_count = EXCLUDED.comparable_episode_count,
    most_recent_comparable_date = EXCLUDED.most_recent_comparable_date,
    profile_freshness = EXCLUDED.profile_freshness,
    valid_from_session_date = EXCLUDED.valid_from_session_date,
    valid_through_session_date = EXCLUDED.valid_through_session_date,
    capture_freshness_class = EXCLUDED.capture_freshness_class,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.late_session_handoff_list_active_v1(p_am_session_date date)
RETURNS SETOF public.late_session_continuation_handoffs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.*
  FROM public.late_session_continuation_handoffs h
  WHERE p_am_session_date >= h.valid_from_session_date
    AND (
      (
        h.source_category = 'DAY_TWO_WATCH'
        AND p_am_session_date <= h.valid_through_session_date
      )
      OR (
        h.source_category <> 'DAY_TWO_WATCH'
        AND p_am_session_date = h.valid_from_session_date
      )
    )
  ORDER BY h.updated_at DESC, h.symbol ASC;
$$;

CREATE OR REPLACE FUNCTION public.late_session_handoff_expire_stale_v1(p_as_of_session_date date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.late_session_continuation_handoffs
    WHERE valid_through_session_date < p_as_of_session_date
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;

REVOKE ALL ON FUNCTION public.late_session_handoff_upsert_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.late_session_handoff_list_active_v1(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.late_session_handoff_expire_stale_v1(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.late_session_handoff_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_list_active_v1(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_expire_stale_v1(date) TO service_role;