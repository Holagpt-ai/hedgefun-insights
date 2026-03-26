
CREATE TABLE public.ticker_search (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL UNIQUE,
  name text NOT NULL,
  exchange text,
  market text,
  type text,
  active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ticker_search ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ticker_search" ON public.ticker_search
  FOR SELECT TO public USING (true);

CREATE INDEX idx_ticker_search_symbol_prefix 
  ON public.ticker_search (symbol text_pattern_ops);

CREATE INDEX idx_ticker_search_name_lower
  ON public.ticker_search (lower(name) text_pattern_ops);

CREATE INDEX idx_ticker_search_symbol_gin
  ON public.ticker_search USING gin(to_tsvector('english', symbol));

CREATE INDEX idx_ticker_search_name_gin
  ON public.ticker_search USING gin(to_tsvector('english', name));
