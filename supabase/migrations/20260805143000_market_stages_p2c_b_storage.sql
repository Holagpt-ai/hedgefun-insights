-- Market Stages P2C-B: four-table generation storage model.
-- Forward-only DDL. No activation RPC, cron, triggers, or replay implementation.
-- Correction/backfill alert_eligible=false remains an orchestration contract (P2D/P2E);
-- this migration only defaults alert_eligible to false.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) market_stage_timeline_generations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.market_stage_timeline_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  algorithm_id text NOT NULL,
  status text NOT NULL,
  parent_generation_id uuid NULL,
  checkpoint_week_end date NULL,
  reason text NOT NULL,
  trigger_week_end date NULL,
  trigger_fingerprint text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  superseded_at timestamptz NULL,
  failed_at timestamptz NULL,
  failure_code text NULL,

  CONSTRAINT market_stage_timeline_generations_symbol_chk
    CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT market_stage_timeline_generations_algorithm_chk
    CHECK (length(trim(algorithm_id)) > 0),
  CONSTRAINT market_stage_timeline_generations_status_chk
    CHECK (status IN ('building', 'active', 'superseded', 'failed')),
  CONSTRAINT market_stage_timeline_generations_reason_chk
    CHECK (reason IN (
      'genesis',
      'forward',
      'correction_same_week',
      'correction_historical',
      'backfill_adjusted'
    )),
  CONSTRAINT market_stage_timeline_generations_checkpoint_friday_chk
    CHECK (checkpoint_week_end IS NULL OR EXTRACT(ISODOW FROM checkpoint_week_end) = 5),
  CONSTRAINT market_stage_timeline_generations_trigger_friday_chk
    CHECK (trigger_week_end IS NULL OR EXTRACT(ISODOW FROM trigger_week_end) = 5),
  CONSTRAINT market_stage_timeline_generations_trigger_fingerprint_chk
    CHECK (
      trigger_fingerprint IS NULL
      OR length(trim(trigger_fingerprint)) > 0
    ),
  CONSTRAINT market_stage_timeline_generations_failure_code_chk
    CHECK (failure_code IS NULL OR length(trim(failure_code)) > 0),
  CONSTRAINT market_stage_timeline_generations_no_self_parent_chk
    CHECK (parent_generation_id IS NULL OR parent_generation_id <> id),
  -- Zero UUID is reserved as the replay-idempotency null sentinel; reject as real data.
  CONSTRAINT market_stage_timeline_generations_id_not_zero_uuid_chk
    CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
  CONSTRAINT market_stage_timeline_generations_status_timestamps_chk
    CHECK (
      (
        status = 'building'
        AND activated_at IS NULL
        AND superseded_at IS NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'active'
        AND activated_at IS NOT NULL
        AND superseded_at IS NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'superseded'
        AND activated_at IS NOT NULL
        AND superseded_at IS NOT NULL
        AND failed_at IS NULL
      )
      OR (
        status = 'failed'
        AND failed_at IS NOT NULL
        AND activated_at IS NULL
        AND superseded_at IS NULL
      )
    ),
  -- Composite candidate key for symbol/algorithm-safe child FKs.
  CONSTRAINT market_stage_timeline_generations_id_symbol_algorithm_uid
    UNIQUE (id, symbol, algorithm_id)
);

ALTER TABLE public.market_stage_timeline_generations
  ADD CONSTRAINT market_stage_timeline_generations_parent_fk
  FOREIGN KEY (parent_generation_id, symbol, algorithm_id)
  REFERENCES public.market_stage_timeline_generations (id, symbol, algorithm_id);

-- One active generation per (symbol, algorithm_id).
CREATE UNIQUE INDEX market_stage_timeline_generations_one_active_uidx
  ON public.market_stage_timeline_generations (symbol, algorithm_id)
  WHERE status = 'active';

-- One building generation per (symbol, algorithm_id).
CREATE UNIQUE INDEX market_stage_timeline_generations_one_building_uidx
  ON public.market_stage_timeline_generations (symbol, algorithm_id)
  WHERE status = 'building';

-- Replay-generation idempotency for non-failed claimed generations.
-- Typed null sentinels avoid non-immutable date/uuid text casts.
-- Zero UUID and DATE '0001-01-01' cannot appear as real values (see CHECKs).
CREATE UNIQUE INDEX market_stage_timeline_generations_replay_idem_uidx
  ON public.market_stage_timeline_generations (
    symbol,
    algorithm_id,
    reason,
    COALESCE(parent_generation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(trigger_week_end, DATE '0001-01-01'),
    COALESCE(trigger_fingerprint, '')
  )
  WHERE status IN ('building', 'active', 'superseded');

CREATE INDEX market_stage_timeline_generations_symbol_algo_created_idx
  ON public.market_stage_timeline_generations (symbol, algorithm_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) market_stage_weekly_evaluations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.market_stage_weekly_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  algorithm_id text NOT NULL,
  effective_week_end date NOT NULL,
  evaluation_status text NOT NULL,
  candidate_stage text NULL,
  input_fingerprint text NULL,
  p1_status text NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT market_stage_weekly_evaluations_symbol_chk
    CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT market_stage_weekly_evaluations_algorithm_chk
    CHECK (length(trim(algorithm_id)) > 0),
  CONSTRAINT market_stage_weekly_evaluations_status_chk
    CHECK (evaluation_status IN (
      'ok',
      'insufficient_data',
      'invalid_input',
      'unavailable'
    )),
  CONSTRAINT market_stage_weekly_evaluations_candidate_chk
    CHECK (
      candidate_stage IS NULL
      OR candidate_stage IN (
        'stage_1',
        'stage_2',
        'stage_3',
        'stage_4',
        'unclassified'
      )
    ),
  CONSTRAINT market_stage_weekly_evaluations_p1_status_chk
    CHECK (
      p1_status IS NULL
      OR p1_status IN ('ok', 'insufficient_data', 'invalid_input')
    ),
  CONSTRAINT market_stage_weekly_evaluations_friday_chk
    CHECK (EXTRACT(ISODOW FROM effective_week_end) = 5),
  CONSTRAINT market_stage_weekly_evaluations_reason_codes_chk
    CHECK (jsonb_typeof(reason_codes) = 'array'),
  CONSTRAINT market_stage_weekly_evaluations_metrics_chk
    CHECK (jsonb_typeof(metrics) = 'object'),
  -- Reject empty-string fingerprints so NULL and '' cannot collide ambiguously.
  CONSTRAINT market_stage_weekly_evaluations_fingerprint_nonempty_chk
    CHECK (
      input_fingerprint IS NULL
      OR length(trim(input_fingerprint)) > 0
    ),
  CONSTRAINT market_stage_weekly_evaluations_status_shape_chk
    CHECK (
      (
        evaluation_status = 'ok'
        AND candidate_stage IS NOT NULL
        AND p1_status IS NOT NULL
        AND p1_status = 'ok'
        AND input_fingerprint IS NOT NULL
        AND length(trim(input_fingerprint)) > 0
      )
      OR (
        evaluation_status IN ('insufficient_data', 'invalid_input')
        AND candidate_stage IS NULL
        AND p1_status IS NOT NULL
        AND p1_status = evaluation_status
        AND input_fingerprint IS NOT NULL
        AND length(trim(input_fingerprint)) > 0
      )
      OR (
        evaluation_status = 'unavailable'
        AND candidate_stage IS NULL
        AND p1_status IS NULL
        AND input_fingerprint IS NULL
      )
    ),
  CONSTRAINT market_stage_weekly_evaluations_generation_fk
    FOREIGN KEY (generation_id, symbol, algorithm_id)
    REFERENCES public.market_stage_timeline_generations (id, symbol, algorithm_id),
  -- Exactly one evaluation row per generation/week.
  CONSTRAINT market_stage_weekly_evaluations_generation_week_uid
    UNIQUE (generation_id, effective_week_end)
);

-- Immutable observation key (stricter week uniqueness already exists above).
CREATE UNIQUE INDEX market_stage_weekly_evaluations_observation_uidx
  ON public.market_stage_weekly_evaluations (
    generation_id,
    effective_week_end,
    COALESCE(input_fingerprint, '')
  );

CREATE INDEX market_stage_weekly_evaluations_symbol_algo_week_idx
  ON public.market_stage_weekly_evaluations (symbol, algorithm_id, effective_week_end DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) market_stage_state
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.market_stage_state (
  symbol text NOT NULL,
  algorithm_id text NOT NULL,
  active_generation_id uuid NOT NULL,
  confirmed_stage text NULL,
  confirmed_effective_week_end date NULL,
  confirmed_at_week_end date NULL,
  pending_stage text NULL,
  pending_count smallint NOT NULL,
  pending_start_week_end date NULL,
  latest_processed_week_end date NOT NULL,
  latest_input_fingerprint text NULL,
  latest_evaluation_status text NOT NULL,
  latest_valid_candidate text NULL,
  latest_valid_candidate_week_end date NULL,
  latest_data_effective_week_end date NULL,
  revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT market_stage_state_pkey
    PRIMARY KEY (symbol, algorithm_id),
  CONSTRAINT market_stage_state_symbol_chk
    CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT market_stage_state_algorithm_chk
    CHECK (length(trim(algorithm_id)) > 0),
  CONSTRAINT market_stage_state_confirmed_stage_chk
    CHECK (
      confirmed_stage IS NULL
      OR confirmed_stage IN (
        'stage_1',
        'stage_2',
        'stage_3',
        'stage_4',
        'unclassified'
      )
    ),
  CONSTRAINT market_stage_state_pending_stage_chk
    CHECK (
      pending_stage IS NULL
      OR pending_stage IN (
        'stage_1',
        'stage_2',
        'stage_3',
        'stage_4',
        'unclassified'
      )
    ),
  CONSTRAINT market_stage_state_latest_valid_candidate_chk
    CHECK (
      latest_valid_candidate IS NULL
      OR latest_valid_candidate IN (
        'stage_1',
        'stage_2',
        'stage_3',
        'stage_4',
        'unclassified'
      )
    ),
  CONSTRAINT market_stage_state_latest_status_chk
    CHECK (latest_evaluation_status IN (
      'ok',
      'insufficient_data',
      'invalid_input',
      'unavailable'
    )),
  CONSTRAINT market_stage_state_pending_count_chk
    CHECK (pending_count IN (0, 1)),
  CONSTRAINT market_stage_state_revision_chk
    CHECK (revision >= 1),
  CONSTRAINT market_stage_state_latest_processed_friday_chk
    CHECK (EXTRACT(ISODOW FROM latest_processed_week_end) = 5),
  CONSTRAINT market_stage_state_confirmed_effective_friday_chk
    CHECK (
      confirmed_effective_week_end IS NULL
      OR EXTRACT(ISODOW FROM confirmed_effective_week_end) = 5
    ),
  CONSTRAINT market_stage_state_confirmed_at_friday_chk
    CHECK (
      confirmed_at_week_end IS NULL
      OR EXTRACT(ISODOW FROM confirmed_at_week_end) = 5
    ),
  CONSTRAINT market_stage_state_pending_start_friday_chk
    CHECK (
      pending_start_week_end IS NULL
      OR EXTRACT(ISODOW FROM pending_start_week_end) = 5
    ),
  CONSTRAINT market_stage_state_latest_valid_week_friday_chk
    CHECK (
      latest_valid_candidate_week_end IS NULL
      OR EXTRACT(ISODOW FROM latest_valid_candidate_week_end) = 5
    ),
  CONSTRAINT market_stage_state_latest_data_week_friday_chk
    CHECK (
      latest_data_effective_week_end IS NULL
      OR EXTRACT(ISODOW FROM latest_data_effective_week_end) = 5
    ),
  CONSTRAINT market_stage_state_confirmed_null_together_chk
    CHECK (
      (
        confirmed_stage IS NULL
        AND confirmed_effective_week_end IS NULL
        AND confirmed_at_week_end IS NULL
      )
      OR (
        confirmed_stage IS NOT NULL
        AND confirmed_effective_week_end IS NOT NULL
        AND confirmed_at_week_end IS NOT NULL
        AND confirmed_at_week_end = (confirmed_effective_week_end + 7)
      )
    ),
  CONSTRAINT market_stage_state_pending_shape_chk
    CHECK (
      (
        pending_stage IS NULL
        AND pending_count = 0
        AND pending_start_week_end IS NULL
      )
      OR (
        pending_stage IS NOT NULL
        AND pending_count = 1
        AND pending_start_week_end IS NOT NULL
      )
    ),
  CONSTRAINT market_stage_state_latest_valid_null_together_chk
    CHECK (
      (
        latest_valid_candidate IS NULL
        AND latest_valid_candidate_week_end IS NULL
      )
      OR (
        latest_valid_candidate IS NOT NULL
        AND latest_valid_candidate_week_end IS NOT NULL
      )
    ),
  CONSTRAINT market_stage_state_latest_fingerprint_chk
    CHECK (
      (
        latest_evaluation_status = 'unavailable'
        AND latest_input_fingerprint IS NULL
      )
      OR (
        latest_evaluation_status <> 'unavailable'
        AND latest_input_fingerprint IS NOT NULL
        AND length(trim(latest_input_fingerprint)) > 0
      )
    ),
  CONSTRAINT market_stage_state_timestamps_chk
    CHECK (updated_at >= created_at),
  CONSTRAINT market_stage_state_active_generation_fk
    FOREIGN KEY (active_generation_id, symbol, algorithm_id)
    REFERENCES public.market_stage_timeline_generations (id, symbol, algorithm_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) market_stage_transitions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.market_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  algorithm_id text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  pending_start_week_end date NOT NULL,
  effective_week_end date NOT NULL,
  confirmed_week_end date NOT NULL,
  calculated_at timestamptz NOT NULL,
  confirmation_input_fingerprint text NOT NULL,
  reason_codes jsonb NOT NULL,
  metrics_snapshot jsonb NOT NULL,
  event_identity text NOT NULL,
  status text NOT NULL,
  alert_eligible boolean NOT NULL DEFAULT false,
  supersedes_event_id uuid NULL,
  superseded_by_event_id uuid NULL,
  withdrawn_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT market_stage_transitions_symbol_chk
    CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT market_stage_transitions_algorithm_chk
    CHECK (length(trim(algorithm_id)) > 0),
  CONSTRAINT market_stage_transitions_from_stage_chk
    CHECK (from_stage IN (
      'stage_1',
      'stage_2',
      'stage_3',
      'stage_4',
      'unclassified'
    )),
  CONSTRAINT market_stage_transitions_to_stage_chk
    CHECK (to_stage IN (
      'stage_1',
      'stage_2',
      'stage_3',
      'stage_4',
      'unclassified'
    )),
  CONSTRAINT market_stage_transitions_stage_change_chk
    CHECK (from_stage <> to_stage),
  CONSTRAINT market_stage_transitions_status_chk
    CHECK (status IN ('active', 'superseded', 'withdrawn')),
  CONSTRAINT market_stage_transitions_reason_codes_chk
    CHECK (jsonb_typeof(reason_codes) = 'array'),
  CONSTRAINT market_stage_transitions_metrics_chk
    CHECK (jsonb_typeof(metrics_snapshot) = 'object'),
  CONSTRAINT market_stage_transitions_fingerprint_chk
    CHECK (length(trim(confirmation_input_fingerprint)) > 0),
  CONSTRAINT market_stage_transitions_pending_start_friday_chk
    CHECK (EXTRACT(ISODOW FROM pending_start_week_end) = 5),
  CONSTRAINT market_stage_transitions_effective_friday_chk
    CHECK (EXTRACT(ISODOW FROM effective_week_end) = 5),
  CONSTRAINT market_stage_transitions_confirmed_friday_chk
    CHECK (EXTRACT(ISODOW FROM confirmed_week_end) = 5),
  CONSTRAINT market_stage_transitions_effective_eq_pending_chk
    CHECK (effective_week_end = pending_start_week_end),
  CONSTRAINT market_stage_transitions_confirmed_plus_7_chk
    CHECK (confirmed_week_end = (effective_week_end + 7)),
  CONSTRAINT market_stage_transitions_event_identity_chk
    CHECK (
      event_identity = (
        algorithm_id
        || '|'
        || symbol
        || '|'
        || from_stage
        || '|'
        || to_stage
        || '|'
        || to_char(effective_week_end, 'YYYY-MM-DD')
        || '|'
        || to_char(confirmed_week_end, 'YYYY-MM-DD')
      )
    ),
  CONSTRAINT market_stage_transitions_no_self_supersedes_chk
    CHECK (supersedes_event_id IS NULL OR supersedes_event_id <> id),
  CONSTRAINT market_stage_transitions_no_self_superseded_by_chk
    CHECK (superseded_by_event_id IS NULL OR superseded_by_event_id <> id),
  CONSTRAINT market_stage_transitions_lifecycle_chk
    CHECK (
      (
        status = 'active'
        AND superseded_by_event_id IS NULL
        AND withdrawn_reason IS NULL
      )
      OR (
        status = 'superseded'
        AND superseded_by_event_id IS NOT NULL
        AND withdrawn_reason IS NULL
      )
      OR (
        status = 'withdrawn'
        AND withdrawn_reason IS NOT NULL
        AND length(trim(withdrawn_reason)) > 0
        AND superseded_by_event_id IS NULL
      )
    ),
  CONSTRAINT market_stage_transitions_generation_fk
    FOREIGN KEY (generation_id, symbol, algorithm_id)
    REFERENCES public.market_stage_timeline_generations (id, symbol, algorithm_id),
  CONSTRAINT market_stage_transitions_generation_identity_uid
    UNIQUE (generation_id, event_identity),
  -- Composite candidate key for same-symbol/algorithm self-links.
  CONSTRAINT market_stage_transitions_id_symbol_algorithm_uid
    UNIQUE (id, symbol, algorithm_id)
);

ALTER TABLE public.market_stage_transitions
  ADD CONSTRAINT market_stage_transitions_supersedes_fk
  FOREIGN KEY (supersedes_event_id, symbol, algorithm_id)
  REFERENCES public.market_stage_transitions (id, symbol, algorithm_id);

ALTER TABLE public.market_stage_transitions
  ADD CONSTRAINT market_stage_transitions_superseded_by_fk
  FOREIGN KEY (superseded_by_event_id, symbol, algorithm_id)
  REFERENCES public.market_stage_transitions (id, symbol, algorithm_id);

CREATE INDEX market_stage_transitions_symbol_algo_confirmed_idx
  ON public.market_stage_transitions (symbol, algorithm_id, confirmed_week_end DESC);

CREATE INDEX market_stage_transitions_status_created_idx
  ON public.market_stage_transitions (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants and RLS (global market data; not user-owned)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.market_stage_timeline_generations FROM PUBLIC;
REVOKE ALL ON TABLE public.market_stage_timeline_generations FROM anon;
REVOKE ALL ON TABLE public.market_stage_timeline_generations FROM authenticated;
REVOKE ALL ON TABLE public.market_stage_weekly_evaluations FROM PUBLIC;
REVOKE ALL ON TABLE public.market_stage_weekly_evaluations FROM anon;
REVOKE ALL ON TABLE public.market_stage_weekly_evaluations FROM authenticated;
REVOKE ALL ON TABLE public.market_stage_state FROM PUBLIC;
REVOKE ALL ON TABLE public.market_stage_state FROM anon;
REVOKE ALL ON TABLE public.market_stage_state FROM authenticated;
REVOKE ALL ON TABLE public.market_stage_transitions FROM PUBLIC;
REVOKE ALL ON TABLE public.market_stage_transitions FROM anon;
REVOKE ALL ON TABLE public.market_stage_transitions FROM authenticated;

-- service_role runtime privileges (no DELETE). Weekly evaluations are append-only.
GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_timeline_generations TO service_role;
GRANT SELECT, INSERT ON TABLE public.market_stage_weekly_evaluations TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_state TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_transitions TO service_role;

-- Authenticated MVP: SELECT only on current active state + active transitions.
GRANT SELECT ON TABLE public.market_stage_state TO authenticated;
GRANT SELECT ON TABLE public.market_stage_transitions TO authenticated;

ALTER TABLE public.market_stage_timeline_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stage_weekly_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stage_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stage_transitions ENABLE ROW LEVEL SECURITY;

-- Sole approved SECURITY DEFINER helper: active-generation check for RLS policies.
-- Does not expose generation history rows to authenticated callers.
CREATE OR REPLACE FUNCTION public.market_stage_generation_is_active(
  p_generation_id uuid,
  p_symbol text,
  p_algorithm_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.market_stage_timeline_generations g
    WHERE g.id = p_generation_id
      AND g.symbol = p_symbol
      AND g.algorithm_id = p_algorithm_id
      AND g.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) TO authenticated;

-- Fail closed: state readable only when pointed generation is active.
CREATE POLICY market_stage_state_authenticated_select
  ON public.market_stage_state
  FOR SELECT
  TO authenticated
  USING (
    public.market_stage_generation_is_active(
      market_stage_state.active_generation_id,
      market_stage_state.symbol,
      market_stage_state.algorithm_id
    )
  );

-- Fail closed: only active events inside an active generation.
CREATE POLICY market_stage_transitions_authenticated_select
  ON public.market_stage_transitions
  FOR SELECT
  TO authenticated
  USING (
    market_stage_transitions.status = 'active'
    AND public.market_stage_generation_is_active(
      market_stage_transitions.generation_id,
      market_stage_transitions.symbol,
      market_stage_transitions.algorithm_id
    )
  );

-- NOTE: No authenticated policies on generations or weekly evaluations.
-- NOTE: No anon policies on any Market Stages table.
-- NOTE: Correction/backfill alert_eligible=false is NOT fully enforced by DDL;
--       alert_eligible DEFAULT false only. Orchestration (P2D/P2E) owns the rule.
