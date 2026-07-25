-- catalyst_events: normalized public catalyst feed
CREATE TABLE IF NOT EXISTS public.catalyst_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  company_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'earnings','fda_biotech','merger_acquisition','analyst_action',
    'sec_filing_news','corporate_action','product_contract','company_news'
  )),
  verification_state TEXT NOT NULL DEFAULT 'provider_reported'
    CHECK (verification_state IN ('provider_reported','unverified')),
  event_date DATE,
  event_time TIMESTAMPTZ,
  time_of_day TEXT CHECK (time_of_day IN ('before_open','after_close','during','unknown')),
  title TEXT,
  description TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  provider TEXT NOT NULL,
  provider_article_id TEXT,
  related_symbols TEXT[] NOT NULL DEFAULT '{}',
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.catalyst_events TO anon, authenticated;
GRANT ALL ON public.catalyst_events TO service_role;
ALTER TABLE public.catalyst_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalyst_events public read"
  ON public.catalyst_events FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_catalyst_events_symbol ON public.catalyst_events(symbol);
CREATE INDEX IF NOT EXISTS idx_catalyst_events_event_type ON public.catalyst_events(event_type);
CREATE INDEX IF NOT EXISTS idx_catalyst_events_event_date ON public.catalyst_events(event_date);
CREATE INDEX IF NOT EXISTS idx_catalyst_events_published_at ON public.catalyst_events(published_at DESC);

CREATE OR REPLACE FUNCTION public.catalyst_events_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalyst_events_updated_at
  BEFORE UPDATE ON public.catalyst_events
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_events_touch_updated_at();

-- catalyst_user_state: per-user dismissed/read markers
CREATE TABLE IF NOT EXISTS public.catalyst_user_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.catalyst_events(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalyst_user_state TO authenticated;
GRANT ALL ON public.catalyst_user_state TO service_role;
ALTER TABLE public.catalyst_user_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalyst_user_state owner read"
  ON public.catalyst_user_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "catalyst_user_state owner insert"
  ON public.catalyst_user_state FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "catalyst_user_state owner update"
  ON public.catalyst_user_state FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "catalyst_user_state owner delete"
  ON public.catalyst_user_state FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_catalyst_user_state_user ON public.catalyst_user_state(user_id);
CREATE INDEX IF NOT EXISTS idx_catalyst_user_state_event ON public.catalyst_user_state(event_id);

CREATE TRIGGER trg_catalyst_user_state_updated_at
  BEFORE UPDATE ON public.catalyst_user_state
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_events_touch_updated_at();