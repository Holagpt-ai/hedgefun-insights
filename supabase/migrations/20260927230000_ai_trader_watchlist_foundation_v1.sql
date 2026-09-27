-- AI Trader autonomous watchlist foundation v1 (Sprint 3A).
-- WRITE ONLY. Do not apply in this sprint.
-- System book: not user watchlists. No trades, orders, positions, or brokers.
-- No pgvector. No embeddings. No seed rows.

CREATE TABLE public.ai_trader_watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  security_id uuid,
  asset_class text NOT NULL DEFAULT 'US_EQUITY' CHECK (asset_class = 'US_EQUITY'),
  state text NOT NULL CHECK (state IN (
    'DISCOVERED', 'RESEARCHING', 'WATCHING', 'HIGH_PRIORITY',
    'ENTRY_READY', 'POSITION_OPEN', 'EXITED', 'COOLDOWN', 'REMOVED'
  )),
  discovered_at timestamptz NOT NULL,
  last_evaluated_at timestamptz NOT NULL,
  current_priority integer NOT NULL CHECK (current_priority >= 1),
  source text NOT NULL,
  source_rank integer NOT NULL CHECK (source_rank >= 1),
  source_session text,
  context_snapshot_id uuid REFERENCES public.ai_trader_context_snapshots(id),
  catalyst_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  market_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  confidence numeric(8,6),
  expires_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol)
);

COMMENT ON TABLE public.ai_trader_watchlist_items IS
  'Autonomous AI Trader watchlist current state. Not user watchlists. Sprint 3A engine ceiling is HIGH_PRIORITY.';

CREATE INDEX ai_trader_watchlist_items_state_rank_idx
  ON public.ai_trader_watchlist_items (state, source_rank ASC);

CREATE INDEX ai_trader_watchlist_items_evaluated_idx
  ON public.ai_trader_watchlist_items (last_evaluated_at DESC);

CREATE TABLE public.ai_trader_watchlist_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_item_id uuid NOT NULL REFERENCES public.ai_trader_watchlist_items(id),
  symbol text NOT NULL,
  prior_state text,
  new_state text NOT NULL CHECK (new_state IN (
    'DISCOVERED', 'RESEARCHING', 'WATCHING', 'HIGH_PRIORITY',
    'ENTRY_READY', 'POSITION_OPEN', 'EXITED', 'COOLDOWN', 'REMOVED'
  )),
  occurred_at timestamptz NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  context_snapshot_id uuid REFERENCES public.ai_trader_context_snapshots(id),
  session_id uuid REFERENCES public.ai_trader_sessions(id),
  source_rank integer,
  confidence numeric(8,6),
  actor_type text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_trader_watchlist_transitions IS
  'Append-only autonomous watchlist audit history.';

CREATE INDEX ai_trader_watchlist_transitions_item_occurred_idx
  ON public.ai_trader_watchlist_transitions (watchlist_item_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.ai_trader_watchlist_item_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_trader watchlist items cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.symbol IS DISTINCT FROM OLD.symbol
    OR NEW.discovered_at IS DISTINCT FROM OLD.discovered_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ai_trader watchlist item identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_trader_watchlist_items_lifecycle
  BEFORE UPDATE OR DELETE ON public.ai_trader_watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_watchlist_item_guard();

CREATE TRIGGER ai_trader_watchlist_transitions_immutable
  BEFORE UPDATE OR DELETE ON public.ai_trader_watchlist_transitions
  FOR EACH ROW EXECUTE FUNCTION public.ai_trader_reject_mutation();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_trader_watchlist_items',
    'ai_trader_watchlist_transitions'
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

REVOKE ALL ON FUNCTION public.ai_trader_watchlist_item_guard() FROM PUBLIC, anon, authenticated;
