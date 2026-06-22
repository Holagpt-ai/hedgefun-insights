ALTER TABLE public.screener_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Screener results are publicly readable"
ON public.screener_results
FOR SELECT
USING (true);

GRANT SELECT ON public.screener_results TO anon, authenticated;
GRANT ALL ON public.screener_results TO service_role;