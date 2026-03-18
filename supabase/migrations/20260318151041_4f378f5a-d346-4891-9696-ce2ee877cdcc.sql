
-- Trade tags (user-defined labels like "swing", "earnings play", etc.)
CREATE TABLE public.trade_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tags" ON public.trade_tags
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trades journal entries
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  entry_price numeric NOT NULL,
  exit_price numeric,
  quantity numeric NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  exit_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  setup_type text,
  emotion integer CHECK (emotion BETWEEN 1 AND 5),
  confidence integer CHECK (confidence BETWEEN 1 AND 5),
  pnl numeric GENERATED ALWAYS AS (
    CASE
      WHEN exit_price IS NOT NULL THEN
        CASE side
          WHEN 'buy' THEN (exit_price - entry_price) * quantity
          WHEN 'sell' THEN (entry_price - exit_price) * quantity
        END
      ELSE NULL
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trades" ON public.trades
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trade-tag assignments (many-to-many)
CREATE TABLE public.trade_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.trade_tags(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (trade_id, tag_id)
);

ALTER TABLE public.trade_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trade tag assignments" ON public.trade_tag_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_id AND trades.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_id AND trades.user_id = auth.uid())
  );
