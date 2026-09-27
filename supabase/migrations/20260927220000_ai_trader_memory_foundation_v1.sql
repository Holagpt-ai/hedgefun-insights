-- AI Trader memory/domain foundation v1 (Sprint 2B.1 lifecycle corrections).
-- WRITE ONLY. Do not apply in this sprint.
-- Target: EXISTING Stocksist / Lovable Cloud Supabase. No second project.
-- System book: no Journal, Game, or user-watchlist reuse.
-- No pgvector. No embeddings. No credentials. No seed trades.

CREATE OR REPLACE FUNCTION public.ai_trader_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'ai_trader append-only: %.% is immutable', TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_allow_is_current_clear()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ai_trader profile id is immutable';
  END IF;
  IF NEW.is_current IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ai_trader profile updates may only clear is_current';
  END IF;
  IF to_jsonb(NEW) - 'is_current' IS DISTINCT FROM to_jsonb(OLD) - 'is_current' THEN
    RAISE EXCEPTION 'ai_trader profile contents are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_session_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  legal boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_trader sessions cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ai_trader session id/created_at are immutable';
  END IF;
  IF OLD.status IN ('KILLED', 'CLOSED', 'FAILED') THEN
    RAISE EXCEPTION 'ai_trader terminal session % cannot mutate', OLD.status;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    legal := (OLD.status, NEW.status) IN (
      ('CREATED', 'ACTIVE'),
      ('CREATED', 'FAILED'),
      ('ACTIVE', 'PAUSED'),
      ('ACTIVE', 'KILLED'),
      ('ACTIVE', 'CLOSED'),
      ('ACTIVE', 'FAILED'),
      ('PAUSED', 'ACTIVE'),
      ('PAUSED', 'KILLED'),
      ('PAUSED', 'CLOSED'),
      ('PAUSED', 'FAILED')
    );
    IF NOT legal THEN
      RAISE EXCEPTION 'ai_trader illegal session transition % → %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF OLD.status <> 'CREATED' THEN
    IF NEW.trading_date IS DISTINCT FROM OLD.trading_date
      OR NEW.operating_mode IS DISTINCT FROM OLD.operating_mode
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.strategy_version_id IS DISTINCT FROM OLD.strategy_version_id
      OR NEW.model_assignment_id IS DISTINCT FROM OLD.model_assignment_id
      OR NEW.risk_config_id IS DISTINCT FROM OLD.risk_config_id
      OR NEW.starting_equity IS DISTINCT FROM OLD.starting_equity
    THEN
      RAISE EXCEPTION 'ai_trader session identity is frozen after leaving CREATED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_model_assignment_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_trader model assignments cannot be deleted';
  END IF;
  IF NEW.active_until IS DISTINCT FROM OLD.active_until THEN
    IF OLD.active_until IS NOT NULL OR NEW.active_until IS NULL THEN
      RAISE EXCEPTION 'ai_trader active_until may close once from NULL to a timestamp';
    END IF;
  END IF;
  IF to_jsonb(NEW) - 'active_until' IS DISTINCT FROM to_jsonb(OLD) - 'active_until' THEN
    RAISE EXCEPTION 'ai_trader model assignment identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_strategy_version_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_trader strategy versions cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.strategy_id IS DISTINCT FROM OLD.strategy_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.parent_version_id IS DISTINCT FROM OLD.parent_version_id
    OR NEW.configuration_hash IS DISTINCT FROM OLD.configuration_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ai_trader strategy version identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_strategy_candidate_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_trader strategy candidates cannot be deleted';
  END IF;
  IF to_jsonb(NEW) - 'status' IS DISTINCT FROM to_jsonb(OLD) - 'status' THEN
    RAISE EXCEPTION 'ai_trader strategy candidates may only change status';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.ai_trader_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_provider text,
  broker_account_ref text,
  environment text NOT NULL CHECK (environment IN ('PAPER', 'LIVE')),
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  display_name text,
  asset_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency text NOT NULL DEFAULT 'USD',
  starting_capital numeric(18,4),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('INACTIVE', 'ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_trader_accounts_no_api_key CHECK (broker_provider IS NULL OR broker_provider NOT ILIKE '%secret%')
);

COMMENT ON TABLE public.ai_trader_accounts IS
  'System-owned trading book identity. No credentials. LIVE environment does not activate LIVE operating mode.';

CREATE TABLE public.ai_trader_strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'PROPOSED', 'BACKTESTING', 'REJECTED', 'SHADOW', 'PAPER', 'APPROVED_CONTROLLED_LIVE', 'RETIRED'
  )),
  parent_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  configuration_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text,
  backtest_evaluation_id uuid,
  shadow_evaluation_id uuid,
  paper_evaluation_id uuid,
  allowed_modes text[] NOT NULL DEFAULT ARRAY[]::text[],
  UNIQUE (strategy_id, version)
);

COMMENT ON TABLE public.ai_trader_strategy_versions IS
  'Identity immutable. Trusted lifecycle updates allowed. AI cannot self-promote. DATABASE CAPABILITY != AI AUTHORITY.';

CREATE TABLE public.ai_trader_model_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN (
    'RESEARCH_MODEL', 'TRADE_PLANNER_MODEL', 'DECISION_MODEL', 'CRITIC_MODEL',
    'EXPLANATION_MODEL', 'POST_TRADE_MODEL', 'REFLECTION_MODEL', 'STRATEGY_RESEARCH_MODEL'
  )),
  provider text NOT NULL,
  model text NOT NULL,
  model_version text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  approved_modes text[] NOT NULL DEFAULT ARRAY[]::text[],
  evaluation_id uuid,
  active_from timestamptz NOT NULL,
  active_until timestamptz,
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_trader_model_assignments IS
  'Identity immutable. active_until may change NULL → timestamp once. No seeded providers.';

CREATE TABLE public.ai_trader_runtime (
  id smallint PRIMARY KEY CHECK (id = 1),
  operating_mode text NOT NULL DEFAULT 'OFF' CHECK (operating_mode IN (
    'OFF', 'BACKTEST', 'SHADOW', 'PAPER', 'CONTROLLED_LIVE', 'LIVE'
  )),
  active_strategy_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  active_risk_config_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public.ai_trader_runtime IS
  'Mutable current system state. Singleton id=1. Default OFF. Credentials never affect this row.';

INSERT INTO public.ai_trader_runtime (id, operating_mode) VALUES (1, 'OFF');

CREATE TABLE public.ai_trader_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_date date NOT NULL,
  operating_mode text NOT NULL CHECK (operating_mode IN (
    'OFF', 'BACKTEST', 'SHADOW', 'PAPER', 'CONTROLLED_LIVE', 'LIVE'
  )),
  account_id uuid REFERENCES public.ai_trader_accounts(id),
  strategy_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  model_assignment_id uuid REFERENCES public.ai_trader_model_assignments(id),
  risk_config_id uuid,
  starting_equity numeric(18,4),
  started_at timestamptz,
  ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('CREATED', 'ACTIVE', 'PAUSED', 'KILLED', 'CLOSED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_trader_sessions IS
  'Controlled lifecycle. Identity freezes after leaving CREATED. Terminal statuses cannot reopen.';

CREATE INDEX ai_trader_sessions_account_date_idx
  ON public.ai_trader_sessions (account_id, trading_date);

CREATE TABLE public.ai_trader_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ai_trader_sessions(id),
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  security_id uuid,
  observed_at timestamptz NOT NULL,
  market_session text NOT NULL,
  operating_mode text NOT NULL CHECK (operating_mode IN (
    'OFF', 'BACKTEST', 'SHADOW', 'PAPER', 'CONTROLLED_LIVE', 'LIVE'
  )),
  quote_timestamp timestamptz,
  market_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  stocksist_signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalyst_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  historical_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_hash text NOT NULL,
  schema_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_hash, schema_version)
);

CREATE INDEX ai_trader_context_snapshots_symbol_observed_idx
  ON public.ai_trader_context_snapshots (symbol, observed_at DESC);

CREATE TABLE public.ai_trader_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  security_id uuid,
  observed_at timestamptz NOT NULL,
  observation_type text NOT NULL,
  value_json jsonb NOT NULL,
  source text NOT NULL,
  source_type text,
  source_id text,
  source_timestamp timestamptz,
  retrieved_at timestamptz,
  verification_state text NOT NULL,
  quality_score numeric(8,6),
  context_snapshot_id uuid REFERENCES public.ai_trader_context_snapshots(id),
  source_event_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_observations_symbol_type_observed_idx
  ON public.ai_trader_observations (symbol, observation_type, observed_at DESC);

CREATE UNIQUE INDEX ai_trader_observations_source_event_key_uidx
  ON public.ai_trader_observations (source_event_key)
  WHERE source_event_key IS NOT NULL;

CREATE TABLE public.ai_trader_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  security_id uuid,
  session_date date NOT NULL,
  episode_type text NOT NULL CHECK (episode_type IN (
    'TRADE', 'PASS', 'WAIT', 'RISK_REJECTION',
    'WATCHLIST_PROMOTION', 'WATCHLIST_REMOVAL', 'MISSED_OPPORTUNITY',
    'EXECUTION_EVENT', 'MARKET_REFERENCE'
  )),
  setup_type text,
  strategy_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  market_regime text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  entry_price numeric(18,6),
  exit_price numeric(18,6),
  mfe numeric(18,6),
  mae numeric(18,6),
  realized_pnl numeric(18,6),
  net_pnl numeric(18,6),
  feature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text,
  context_snapshot_id uuid REFERENCES public.ai_trader_context_snapshots(id),
  external_market_episode_id text,
  trade_id uuid,
  decision_id uuid,
  source_event_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_episodes_symbol_session_idx
  ON public.ai_trader_episodes (symbol, session_date DESC);

CREATE INDEX ai_trader_episodes_setup_session_idx
  ON public.ai_trader_episodes (setup_type, session_date DESC);

CREATE INDEX ai_trader_episodes_regime_session_idx
  ON public.ai_trader_episodes (market_regime, session_date DESC);

CREATE INDEX ai_trader_episodes_started_at_idx
  ON public.ai_trader_episodes (started_at DESC);

CREATE UNIQUE INDEX ai_trader_episodes_source_event_key_uidx
  ON public.ai_trader_episodes (source_event_key)
  WHERE source_event_key IS NOT NULL;

CREATE TABLE public.ai_trader_symbol_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  security_id uuid,
  profile_version text NOT NULL,
  lookback_window text NOT NULL,
  sample_size integer NOT NULL CHECK (sample_size > 0),
  derived_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior_summary text,
  confidence numeric(8,6),
  evidence_observation_ids uuid[] NOT NULL,
  methodology_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES public.ai_trader_symbol_profiles(id),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(evidence_observation_ids) > 0)
);

CREATE UNIQUE INDEX ai_trader_symbol_profiles_current_uidx
  ON public.ai_trader_symbol_profiles (symbol)
  WHERE is_current;

CREATE INDEX ai_trader_symbol_profiles_asof_idx
  ON public.ai_trader_symbol_profiles (symbol, generated_at DESC);

CREATE TABLE public.ai_trader_setup_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_key text NOT NULL,
  strategy_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  profile_version text NOT NULL,
  lookback_window text NOT NULL DEFAULT 'unspecified',
  sample_size integer NOT NULL CHECK (sample_size > 0),
  win_rate numeric(8,6),
  expectancy numeric(18,6),
  profit_factor numeric(18,6),
  median_mfe numeric(18,6),
  median_mae numeric(18,6),
  failure_signatures jsonb NOT NULL DEFAULT '[]'::jsonb,
  successful_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  regime_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior_summary text,
  confidence numeric(8,6),
  evidence_ids uuid[] NOT NULL,
  methodology_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES public.ai_trader_setup_profiles(id),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(evidence_ids) > 0)
);

CREATE UNIQUE INDEX ai_trader_setup_profiles_current_uidx
  ON public.ai_trader_setup_profiles (setup_key, COALESCE(strategy_version_id::text, ''))
  WHERE is_current;

CREATE INDEX ai_trader_setup_profiles_asof_idx
  ON public.ai_trader_setup_profiles (setup_key, generated_at DESC);

CREATE TABLE public.ai_trader_regime_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime_key text NOT NULL,
  profile_version text NOT NULL,
  lookback_window text NOT NULL DEFAULT 'unspecified',
  sample_size integer NOT NULL CHECK (sample_size > 0),
  derived_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior_summary text,
  confidence numeric(8,6),
  evidence_ids uuid[] NOT NULL,
  methodology_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES public.ai_trader_regime_profiles(id),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(evidence_ids) > 0)
);

CREATE UNIQUE INDEX ai_trader_regime_profiles_current_uidx
  ON public.ai_trader_regime_profiles (regime_key)
  WHERE is_current;

CREATE INDEX ai_trader_regime_profiles_asof_idx
  ON public.ai_trader_regime_profiles (regime_key, generated_at DESC);

CREATE TABLE public.ai_trader_decision_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL,
  context_snapshot_id uuid REFERENCES public.ai_trader_context_snapshots(id),
  episode_id uuid REFERENCES public.ai_trader_episodes(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  relevance_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_by_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_decision_evidence_decision_idx
  ON public.ai_trader_decision_evidence (decision_id);

COMMENT ON COLUMN public.ai_trader_decision_evidence.decision_id IS
  'Correlation UUID until ai_trader_decisions exists. No FK in this migration.';

CREATE TABLE public.ai_trader_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid,
  decision_id uuid,
  reflection_type text NOT NULL CHECK (reflection_type IN (
    'TRADE', 'PASS', 'WAIT', 'RISK_REJECTION',
    'WATCHLIST_PROMOTION', 'WATCHLIST_REMOVAL', 'MISSED_OPPORTUNITY', 'EXECUTION_EVENT'
  )),
  process_quality text NOT NULL CHECK (process_quality IN (
    'BAD_PROCESS_GOOD_OUTCOME',
    'GOOD_PROCESS_BAD_OUTCOME',
    'GOOD_PROCESS_GOOD_OUTCOME',
    'BAD_PROCESS_BAD_OUTCOME'
  )),
  model_provider text,
  model_version text,
  prompt_version text,
  schema_version text NOT NULL DEFAULT 'v1',
  summary text NOT NULL,
  what_worked jsonb NOT NULL DEFAULT '[]'::jsonb,
  what_failed jsonb NOT NULL DEFAULT '[]'::jsonb,
  earliest_failure_signal text,
  lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(8,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_reflections_trade_idx ON public.ai_trader_reflections (trade_id);
CREATE INDEX ai_trader_reflections_decision_idx ON public.ai_trader_reflections (decision_id);

CREATE TABLE public.ai_trader_counterfactuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid,
  decision_id uuid,
  alternative_action text NOT NULL,
  alternative_entry numeric(18,6),
  alternative_stop numeric(18,6),
  alternative_exit numeric(18,6),
  estimated_outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  methodology text NOT NULL,
  limitations text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_counterfactuals_trade_idx ON public.ai_trader_counterfactuals (trade_id);
CREATE INDEX ai_trader_counterfactuals_decision_idx ON public.ai_trader_counterfactuals (decision_id);

CREATE TABLE public.ai_trader_strategy_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_strategy_version_id uuid REFERENCES public.ai_trader_strategy_versions(id),
  candidate_version text NOT NULL,
  hypothesis text NOT NULL,
  source_reflection_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL CHECK (status IN (
    'PROPOSED', 'BACKTESTING', 'REJECTED', 'SHADOW', 'PAPER', 'APPROVED_CONTROLLED_LIVE', 'RETIRED'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_strategy_candidates_status_idx
  ON public.ai_trader_strategy_candidates (status, created_at DESC);

COMMENT ON TABLE public.ai_trader_strategy_candidates IS
  'Hypotheses only. Application adapter inserts PROPOSED only. No promotion RPC.';

CREATE TABLE public.ai_trader_reward_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid,
  decision_id uuid,
  reflection_id uuid REFERENCES public.ai_trader_reflections(id),
  process_quality text NOT NULL CHECK (process_quality IN (
    'BAD_PROCESS_GOOD_OUTCOME',
    'GOOD_PROCESS_BAD_OUTCOME',
    'GOOD_PROCESS_GOOD_OUTCOME',
    'BAD_PROCESS_BAD_OUTCOME'
  )),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_trader_reward_assessments IS
  'Research-only dimensions. Risk Governor must not read this table.';

CREATE INDEX ai_trader_reward_assessments_trade_idx ON public.ai_trader_reward_assessments (trade_id);
CREATE INDEX ai_trader_reward_assessments_decision_idx ON public.ai_trader_reward_assessments (decision_id);

CREATE TABLE public.ai_trader_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id uuid,
  context_snapshot_id uuid,
  decision_id uuid,
  trade_plan_id uuid,
  critic_review_id uuid,
  risk_decision_id uuid,
  order_intent_id uuid,
  broker_order_id text,
  position_id uuid,
  trade_id uuid,
  reflection_id uuid,
  schema_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_trader_audit_events_no_cot CHECK (
    NOT (payload ? 'chainOfThought')
    AND NOT (payload ? 'rawReasoning')
    AND NOT (payload ? 'apiKey')
    AND NOT (payload ? 'apiSecret')
  )
);

CREATE INDEX ai_trader_audit_events_occurred_idx
  ON public.ai_trader_audit_events (occurred_at DESC);

CREATE INDEX ai_trader_audit_events_session_idx
  ON public.ai_trader_audit_events (session_id);

CREATE INDEX ai_trader_model_assignments_role_from_idx
  ON public.ai_trader_model_assignments (role, active_from DESC);

-- Strict append-only evidence. Lifecycle tables are NOT in this list.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_trader_context_snapshots',
    'ai_trader_observations',
    'ai_trader_episodes',
    'ai_trader_decision_evidence',
    'ai_trader_reflections',
    'ai_trader_counterfactuals',
    'ai_trader_reward_assessments',
    'ai_trader_audit_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ai_trader_reject_mutation()',
      t || '_immutable',
      t
    );
  END LOOP;
END;
$$;

CREATE TRIGGER ai_trader_sessions_lifecycle
  BEFORE UPDATE OR DELETE ON public.ai_trader_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_session_lifecycle_guard();

CREATE TRIGGER ai_trader_model_assignments_lifecycle
  BEFORE UPDATE OR DELETE ON public.ai_trader_model_assignments
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_model_assignment_lifecycle_guard();

CREATE TRIGGER ai_trader_strategy_versions_lifecycle
  BEFORE UPDATE OR DELETE ON public.ai_trader_strategy_versions
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_strategy_version_lifecycle_guard();

CREATE TRIGGER ai_trader_strategy_candidates_lifecycle
  BEFORE UPDATE OR DELETE ON public.ai_trader_strategy_candidates
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_strategy_candidate_lifecycle_guard();

CREATE TRIGGER ai_trader_symbol_profiles_immutable
  BEFORE UPDATE ON public.ai_trader_symbol_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_allow_is_current_clear();

CREATE TRIGGER ai_trader_setup_profiles_immutable
  BEFORE UPDATE ON public.ai_trader_setup_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_allow_is_current_clear();

CREATE TRIGGER ai_trader_regime_profiles_immutable
  BEFORE UPDATE ON public.ai_trader_regime_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_allow_is_current_clear();

CREATE TRIGGER ai_trader_symbol_profiles_no_delete
  BEFORE DELETE ON public.ai_trader_symbol_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_reject_mutation();

CREATE TRIGGER ai_trader_setup_profiles_no_delete
  BEFORE DELETE ON public.ai_trader_setup_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_reject_mutation();

CREATE TRIGGER ai_trader_regime_profiles_no_delete
  BEFORE DELETE ON public.ai_trader_regime_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_reject_mutation();

CREATE OR REPLACE FUNCTION public.ai_trader_replace_symbol_profile_v1(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
  v_symbol text := p_row->>'symbol';
  v_prior uuid;
BEGIN
  IF v_symbol IS NULL OR v_symbol = '' THEN
    RAISE EXCEPTION 'symbol required';
  END IF;
  SELECT id INTO v_prior
  FROM public.ai_trader_symbol_profiles
  WHERE symbol = v_symbol AND is_current
  LIMIT 1;

  IF v_prior IS NOT NULL THEN
    UPDATE public.ai_trader_symbol_profiles SET is_current = false WHERE id = v_prior;
  END IF;

  INSERT INTO public.ai_trader_symbol_profiles (
    symbol, asset_class, security_id, profile_version, lookback_window, sample_size,
    derived_metrics, behavior_summary, confidence, evidence_observation_ids,
    methodology_version, generated_at, supersedes_id, is_current
  ) VALUES (
    v_symbol,
    COALESCE(p_row->>'asset_class', 'US_EQUITY'),
    NULLIF(p_row->>'security_id', '')::uuid,
    p_row->>'profile_version',
    p_row->>'lookback_window',
    (p_row->>'sample_size')::integer,
    COALESCE(p_row->'derived_metrics', '{}'::jsonb),
    p_row->>'behavior_summary',
    NULLIF(p_row->>'confidence', '')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'evidence_observation_ids', '[]'::jsonb)))::uuid[],
    COALESCE(p_row->>'methodology_version', 'v1'),
    COALESCE((p_row->>'generated_at')::timestamptz, now()),
    v_prior,
    true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_replace_setup_profile_v1(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
  v_key text := p_row->>'setup_key';
  v_strategy uuid := NULLIF(p_row->>'strategy_version_id', '')::uuid;
  v_prior uuid;
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'setup_key required';
  END IF;
  SELECT id INTO v_prior
  FROM public.ai_trader_setup_profiles
  WHERE setup_key = v_key
    AND strategy_version_id IS NOT DISTINCT FROM v_strategy
    AND is_current
  LIMIT 1;

  IF v_prior IS NOT NULL THEN
    UPDATE public.ai_trader_setup_profiles SET is_current = false WHERE id = v_prior;
  END IF;

  INSERT INTO public.ai_trader_setup_profiles (
    setup_key, strategy_version_id, profile_version, lookback_window, sample_size,
    win_rate, expectancy, profit_factor, median_mfe, median_mae,
    failure_signatures, successful_conditions, regime_breakdown, derived_metrics,
    behavior_summary, confidence, evidence_ids, methodology_version, generated_at,
    supersedes_id, is_current
  ) VALUES (
    v_key,
    v_strategy,
    p_row->>'profile_version',
    COALESCE(p_row->>'lookback_window', 'unspecified'),
    (p_row->>'sample_size')::integer,
    NULLIF(p_row->>'win_rate', '')::numeric,
    NULLIF(p_row->>'expectancy', '')::numeric,
    NULLIF(p_row->>'profit_factor', '')::numeric,
    NULLIF(p_row->>'median_mfe', '')::numeric,
    NULLIF(p_row->>'median_mae', '')::numeric,
    COALESCE(p_row->'failure_signatures', '[]'::jsonb),
    COALESCE(p_row->'successful_conditions', '[]'::jsonb),
    COALESCE(p_row->'regime_breakdown', '{}'::jsonb),
    COALESCE(p_row->'derived_metrics', '{}'::jsonb),
    p_row->>'behavior_summary',
    NULLIF(p_row->>'confidence', '')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'evidence_ids', '[]'::jsonb)))::uuid[],
    COALESCE(p_row->>'methodology_version', 'v1'),
    COALESCE((p_row->>'generated_at')::timestamptz, now()),
    v_prior,
    true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_trader_replace_regime_profile_v1(p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
  v_key text := p_row->>'regime_key';
  v_prior uuid;
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'regime_key required';
  END IF;
  SELECT id INTO v_prior
  FROM public.ai_trader_regime_profiles
  WHERE regime_key = v_key AND is_current
  LIMIT 1;

  IF v_prior IS NOT NULL THEN
    UPDATE public.ai_trader_regime_profiles SET is_current = false WHERE id = v_prior;
  END IF;

  INSERT INTO public.ai_trader_regime_profiles (
    regime_key, profile_version, lookback_window, sample_size, derived_metrics,
    behavior_summary, confidence, evidence_ids, methodology_version, generated_at,
    supersedes_id, is_current
  ) VALUES (
    v_key,
    p_row->>'profile_version',
    COALESCE(p_row->>'lookback_window', 'unspecified'),
    (p_row->>'sample_size')::integer,
    COALESCE(p_row->'derived_metrics', '{}'::jsonb),
    p_row->>'behavior_summary',
    NULLIF(p_row->>'confidence', '')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'evidence_ids', '[]'::jsonb)))::uuid[],
    COALESCE(p_row->>'methodology_version', 'v1'),
    COALESCE((p_row->>'generated_at')::timestamptz, now()),
    v_prior,
    true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RLS: system book. No client policies. Service role bypasses RLS.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_trader_accounts',
    'ai_trader_sessions',
    'ai_trader_runtime',
    'ai_trader_model_assignments',
    'ai_trader_strategy_versions',
    'ai_trader_context_snapshots',
    'ai_trader_observations',
    'ai_trader_episodes',
    'ai_trader_symbol_profiles',
    'ai_trader_setup_profiles',
    'ai_trader_regime_profiles',
    'ai_trader_decision_evidence',
    'ai_trader_reflections',
    'ai_trader_counterfactuals',
    'ai_trader_strategy_candidates',
    'ai_trader_reward_assessments',
    'ai_trader_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_trader_reject_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_allow_is_current_clear() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_session_lifecycle_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_model_assignment_lifecycle_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_strategy_version_lifecycle_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_strategy_candidate_lifecycle_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_replace_symbol_profile_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_replace_setup_profile_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_trader_replace_regime_profile_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_trader_replace_symbol_profile_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_trader_replace_setup_profile_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_trader_replace_regime_profile_v1(jsonb) TO service_role;
