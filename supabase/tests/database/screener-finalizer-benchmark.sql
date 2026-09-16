-- Isolated 52-week set-based finalize runtime benchmark.
-- Synthetic data only. Does not touch production.
-- Production-density: 11,961 baseline rows + 2,671 exclusions.

\set ON_ERROR_STOP on
\timing off

DROP TABLE IF EXISTS bench_meta;
DROP TABLE IF EXISTS bench_runs;
DROP TABLE IF EXISTS bench_rows;
DROP TABLE IF EXISTS bench_exclusions;

CREATE TEMP TABLE bench_meta (
  k text PRIMARY KEY,
  v text NOT NULL
);

CREATE TEMP TABLE bench_runs (
  run_name text PRIMARY KEY,
  generation_id uuid NOT NULL,
  elapsed_ms numeric NOT NULL,
  symbol_count integer NOT NULL,
  exclusion_count integer NOT NULL
);

CREATE TEMP TABLE bench_rows (
  symbol text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TEMP TABLE bench_exclusions (
  symbol text PRIMARY KEY,
  payload jsonb NOT NULL
);

INSERT INTO bench_meta (k, v) VALUES
  ('baseline_count', '11961'),
  ('exclusion_count', '2671'),
  ('min_sessions', '120'),
  ('candidate_count', '18'),
  ('period_start', '2025-08-10'),
  ('period_end', '2026-08-10');

DO $gen$
DECLARE
  v_as_of timestamptz := clock_timestamp() - interval '1 hour';
  v_period_start date := DATE '2025-08-10';
  v_period_end date := DATE '2026-08-10';
  v_candidates_high jsonb;
  v_candidates_low jsonb;
  i integer;
BEGIN
  FOR i IN 0..17 LOOP
    v_candidates_high := coalesce(v_candidates_high, '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'd', (DATE '2025-09-01' + i)::text,
        'v', 180.25 - (i * 0.37)
      ));
    v_candidates_low := coalesce(v_candidates_low, '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'd', (DATE '2025-10-01' + i)::text,
        'v', 12.5 + (i * 0.19)
      ));
  END LOOP;

  INSERT INTO bench_rows (symbol, payload)
  SELECT
    'B' || lpad(g::text, 5, '0'),
    jsonb_build_object(
      'symbol', 'B' || lpad(g::text, 5, '0'),
      'period_start', v_period_start,
      'period_end', v_period_end,
      'high_52w', 180.25,
      'low_52w', 12.5,
      'high_candidates', v_candidates_high,
      'low_candidates', v_candidates_low,
      'sessions_observed', 120 + (g % 80),
      'provider_as_of', v_as_of
    )
  FROM generate_series(0, 11960) AS g;

  INSERT INTO bench_exclusions (symbol, payload)
  SELECT
    'X' || lpad(g::text, 5, '0'),
    jsonb_build_object(
      'symbol', 'X' || lpad(g::text, 5, '0'),
      'reason', 'insufficient_sessions',
      'sessions_observed', 1 + (g % 119),
      'min_sessions', 120
    )
  FROM generate_series(0, 2670) AS g;
END;
$gen$;

INSERT INTO bench_meta (k, v)
SELECT 'reconstructed_payload_bytes', octet_length(jsonb_agg(payload ORDER BY symbol)::text)::text
FROM bench_rows;

INSERT INTO bench_meta (k, v)
SELECT 'exclusion_payload_bytes', octet_length(jsonb_agg(payload ORDER BY symbol)::text)::text
FROM bench_exclusions;

CREATE OR REPLACE FUNCTION pg_temp.stage_generation(p_generation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_as_of timestamptz;
  v_chunk jsonb;
  v_started jsonb;
BEGIN
  SELECT (payload ->> 'provider_as_of')::timestamptz
    INTO v_as_of
  FROM bench_rows
  LIMIT 1;

  v_started := public.start_screener_52w_baseline_publish_v1(
    p_generation_id,
    DATE '2025-08-10',
    DATE '2026-08-10',
    v_as_of,
    11961,
    2671,
    120
  );
  IF v_started ->> 'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'start failed: %', v_started;
  END IF;

  FOR v_chunk IN
    SELECT jsonb_agg(payload ORDER BY symbol)
    FROM (
      SELECT
        payload,
        symbol,
        ((row_number() OVER (ORDER BY symbol) - 1) / 250)::integer AS chunk_id
      FROM bench_rows
    ) s
    GROUP BY chunk_id
    ORDER BY chunk_id
  LOOP
    PERFORM public.append_screener_52w_baseline_rows_v1(p_generation_id, v_chunk);
  END LOOP;

  FOR v_chunk IN
    SELECT jsonb_agg(payload ORDER BY symbol)
    FROM (
      SELECT
        payload,
        symbol,
        ((row_number() OVER (ORDER BY symbol) - 1) / 250)::integer AS chunk_id
      FROM bench_exclusions
    ) s
    GROUP BY chunk_id
    ORDER BY chunk_id
  LOOP
    PERFORM public.append_screener_52w_baseline_exclusions_v1(p_generation_id, v_chunk);
  END LOOP;

  IF (
    SELECT COUNT(*) FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = p_generation_id
  ) IS DISTINCT FROM 11961 THEN
    RAISE EXCEPTION 'staged baseline count mismatch';
  END IF;
  IF (
    SELECT COUNT(*) FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = p_generation_id
  ) IS DISTINCT FROM 2671 THEN
    RAISE EXCEPTION 'staged exclusion count mismatch';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.assert_published(p_generation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_state public.screener_52w_baseline_state%ROWTYPE;
  v_rows integer;
  v_excl integer;
  v_overlap integer;
  v_bad_rows integer;
  v_bad_excl integer;
  v_job integer;
  v_staged_rows integer;
  v_staged_excl integer;
  v_other_base integer;
  v_other_excl integer;
BEGIN
  SELECT * INTO v_state
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'missing current state';
  END IF;
  IF v_state.status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'state.status=%', v_state.status;
  END IF;
  IF v_state.current_generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'state.current_generation_id mismatch';
  END IF;
  IF v_state.symbol_count IS DISTINCT FROM 11961 THEN
    RAISE EXCEPTION 'state.symbol_count=%', v_state.symbol_count;
  END IF;
  IF v_state.policy_min_sessions IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'policy_min_sessions=%', v_state.policy_min_sessions;
  END IF;
  IF v_state.policy_excluded_count IS DISTINCT FROM 2671 THEN
    RAISE EXCEPTION 'policy_excluded_count=%', v_state.policy_excluded_count;
  END IF;

  SELECT COUNT(*) INTO v_rows
  FROM public.screener_52w_baselines
  WHERE generation_id = p_generation_id;
  SELECT COUNT(*) INTO v_excl
  FROM public.screener_52w_baseline_exclusions
  WHERE generation_id = p_generation_id;
  IF v_rows IS DISTINCT FROM v_state.symbol_count THEN
    RAISE EXCEPTION 'baseline rows=%', v_rows;
  END IF;
  IF v_excl IS DISTINCT FROM v_state.policy_excluded_count THEN
    RAISE EXCEPTION 'exclusion rows=%', v_excl;
  END IF;

  SELECT COUNT(*) INTO v_other_base
  FROM public.screener_52w_baselines
  WHERE generation_id IS DISTINCT FROM p_generation_id;
  SELECT COUNT(*) INTO v_other_excl
  FROM public.screener_52w_baseline_exclusions
  WHERE generation_id IS DISTINCT FROM p_generation_id;
  IF v_other_base <> 0 OR v_other_excl <> 0 THEN
    RAISE EXCEPTION 'stale production generations remain base=% excl=%', v_other_base, v_other_excl;
  END IF;

  SELECT COUNT(*) INTO v_overlap
  FROM public.screener_52w_baselines b
  JOIN public.screener_52w_baseline_exclusions e
    ON e.generation_id = b.generation_id
   AND e.symbol = b.symbol
  WHERE b.generation_id = p_generation_id;
  IF v_overlap <> 0 THEN
    RAISE EXCEPTION 'baseline/exclusion overlap=%', v_overlap;
  END IF;

  SELECT COUNT(*) INTO v_bad_rows
  FROM public.screener_52w_baselines
  WHERE generation_id = p_generation_id
    AND sessions_observed < 120;
  IF v_bad_rows <> 0 THEN
    RAISE EXCEPTION 'under-min baseline rows=%', v_bad_rows;
  END IF;

  SELECT COUNT(*) INTO v_bad_excl
  FROM public.screener_52w_baseline_exclusions
  WHERE generation_id = p_generation_id
    AND (
      sessions_observed < 1
      OR sessions_observed > 119
      OR reason IS DISTINCT FROM 'insufficient_sessions'
    );
  IF v_bad_excl <> 0 THEN
    RAISE EXCEPTION 'invalid exclusion rows=%', v_bad_excl;
  END IF;

  SELECT COUNT(*) INTO v_job FROM public.screener_52w_baseline_publish_job;
  SELECT COUNT(*) INTO v_staged_rows FROM public.screener_52w_baseline_publish_rows;
  SELECT COUNT(*) INTO v_staged_excl FROM public.screener_52w_baseline_publish_exclusions;
  IF v_job <> 0 OR v_staged_rows <> 0 OR v_staged_excl <> 0 THEN
    RAISE EXCEPTION 'staging not cleaned job=% rows=% excl=%', v_job, v_staged_rows, v_staged_excl;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.run_finalize(p_run_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_gen uuid := gen_random_uuid();
  v_start timestamptz;
  v_end timestamptz;
  v_inserted integer;
BEGIN
  PERFORM pg_temp.stage_generation(v_gen);
  v_start := clock_timestamp();
  v_inserted := public.finalize_screener_52w_baseline_publish_v1(v_gen);
  v_end := clock_timestamp();
  IF v_inserted IS DISTINCT FROM 11961 THEN
    RAISE EXCEPTION '% inserted=%', p_run_name, v_inserted;
  END IF;
  PERFORM pg_temp.assert_published(v_gen);
  INSERT INTO bench_runs (run_name, generation_id, elapsed_ms, symbol_count, exclusion_count)
  VALUES (
    p_run_name,
    v_gen,
    round(extract(epoch FROM (v_end - v_start)) * 1000, 1),
    11961,
    2671
  );
  RETURN v_gen;
END;
$fn$;

SELECT pg_temp.run_finalize('warmup');
SELECT pg_temp.run_finalize('run_1');
SELECT pg_temp.run_finalize('run_2');
SELECT pg_temp.run_finalize('run_3');

DO $replay$
DECLARE
  v_gen uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_returned integer;
  v_state_before public.screener_52w_baseline_state%ROWTYPE;
  v_state_after public.screener_52w_baseline_state%ROWTYPE;
  v_rows_before integer;
  v_excl_before integer;
  v_rows_after integer;
  v_excl_after integer;
  v_wrong text;
BEGIN
  SELECT generation_id INTO v_gen FROM bench_runs WHERE run_name = 'run_3';
  SELECT * INTO v_state_before
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current';
  SELECT COUNT(*) INTO v_rows_before
  FROM public.screener_52w_baselines
  WHERE generation_id = v_gen;
  SELECT COUNT(*) INTO v_excl_before
  FROM public.screener_52w_baseline_exclusions
  WHERE generation_id = v_gen;

  v_start := clock_timestamp();
  v_returned := public.finalize_screener_52w_baseline_publish_v1(v_gen);
  v_end := clock_timestamp();

  IF v_returned IS DISTINCT FROM 11961 THEN
    RAISE EXCEPTION 'replay returned %', v_returned;
  END IF;

  SELECT * INTO v_state_after
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current';
  SELECT COUNT(*) INTO v_rows_after
  FROM public.screener_52w_baselines
  WHERE generation_id = v_gen;
  SELECT COUNT(*) INTO v_excl_after
  FROM public.screener_52w_baseline_exclusions
  WHERE generation_id = v_gen;

  IF v_state_after.current_generation_id IS DISTINCT FROM v_state_before.current_generation_id
     OR v_state_after.symbol_count IS DISTINCT FROM v_state_before.symbol_count
     OR v_state_after.policy_min_sessions IS DISTINCT FROM v_state_before.policy_min_sessions
     OR v_state_after.policy_excluded_count IS DISTINCT FROM v_state_before.policy_excluded_count
     OR v_state_after.status IS DISTINCT FROM v_state_before.status
     OR v_state_after.updated_at IS DISTINCT FROM v_state_before.updated_at THEN
    RAISE EXCEPTION 'replay mutated production state';
  END IF;
  IF v_rows_after IS DISTINCT FROM v_rows_before OR v_excl_after IS DISTINCT FROM v_excl_before THEN
    RAISE EXCEPTION 'replay mutated published rows';
  END IF;

  INSERT INTO bench_runs (run_name, generation_id, elapsed_ms, symbol_count, exclusion_count)
  VALUES (
    'replay',
    v_gen,
    round(extract(epoch FROM (v_end - v_start)) * 1000, 1),
    11961,
    2671
  );

  BEGIN
    PERFORM public.finalize_screener_52w_baseline_publish_v1(gen_random_uuid());
    RAISE EXCEPTION 'wrong generation did not raise';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_wrong = MESSAGE_TEXT;
      IF v_wrong IS DISTINCT FROM 'wrong generation' THEN
        RAISE EXCEPTION 'unexpected wrong-generation error: %', v_wrong;
      END IF;
  END;
END;
$replay$;

WITH measured AS (
  SELECT elapsed_ms
  FROM bench_runs
  WHERE run_name IN ('run_1', 'run_2', 'run_3')
),
ordered AS (
  SELECT elapsed_ms, row_number() OVER (ORDER BY elapsed_ms) AS rn
  FROM measured
),
stats AS (
  SELECT
    (SELECT elapsed_ms FROM bench_runs WHERE run_name = 'warmup') AS warmup_ms,
    (SELECT elapsed_ms FROM bench_runs WHERE run_name = 'run_1') AS run_1_ms,
    (SELECT elapsed_ms FROM bench_runs WHERE run_name = 'run_2') AS run_2_ms,
    (SELECT elapsed_ms FROM bench_runs WHERE run_name = 'run_3') AS run_3_ms,
    (SELECT elapsed_ms FROM bench_runs WHERE run_name = 'replay') AS replay_ms,
    (SELECT elapsed_ms FROM ordered WHERE rn = 2) AS median_ms,
    (SELECT MAX(elapsed_ms) FROM measured) AS max_ms
)
SELECT jsonb_pretty(jsonb_build_object(
  'msg', 'screener_finalizer_benchmark',
  'pg_version', current_setting('server_version'),
  'baseline_count', 11961,
  'exclusion_count', 2671,
  'min_sessions', 120,
  'candidate_count', 18,
  'reconstructed_payload_bytes', (
    SELECT v::bigint FROM bench_meta WHERE k = 'reconstructed_payload_bytes'
  ),
  'exclusion_payload_bytes', (
    SELECT v::bigint FROM bench_meta WHERE k = 'exclusion_payload_bytes'
  ),
  'warmup_ms', warmup_ms,
  'run_1_ms', run_1_ms,
  'run_2_ms', run_2_ms,
  'run_3_ms', run_3_ms,
  'median_ms', median_ms,
  'max_ms', max_ms,
  'replay_ms', replay_ms,
  'correctness', 'pass',
  'timeout_budget_ms', 1500,
  'verdict', CASE
    WHEN max_ms <= 1000 THEN 'PASS'
    WHEN max_ms <= 1500 THEN 'CAUTION'
    ELSE 'FAIL'
  END
))
FROM stats;
