
CREATE TABLE public.etfs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text UNIQUE NOT NULL,
  name text NOT NULL,
  asset_class text,
  total_assets bigint,
  price numeric(12,4),
  change_percent numeric(8,4),
  volume bigint,
  holdings integer,
  expense_ratio numeric(6,4),
  provider text,
  inception_date date,
  ytd_return numeric(8,4),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.etfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read etfs" ON public.etfs FOR SELECT USING (true);
