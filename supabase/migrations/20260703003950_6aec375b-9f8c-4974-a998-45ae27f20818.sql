
DROP POLICY IF EXISTS "Authenticated users read watchlist_ai_alerts" ON public.watchlist_ai_alerts;
CREATE POLICY "Users read alerts for own watchlist"
  ON public.watchlist_ai_alerts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.user_id = auth.uid() AND w.symbol = watchlist_ai_alerts.ticker
  ));

DROP POLICY IF EXISTS "Authenticated users read watchlist_ai_analysis" ON public.watchlist_ai_analysis;
CREATE POLICY "Users read analysis for own watchlist"
  ON public.watchlist_ai_analysis FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.user_id = auth.uid() AND w.symbol = watchlist_ai_analysis.ticker
  ));

CREATE OR REPLACE FUNCTION public.trigger_watchlist_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  perform net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer hf_sync_8f3a1c92d4e6b07159fa3c2e8d6b4910'
    ),
    body := jsonb_build_object('record', jsonb_build_object('symbol', new.symbol))
  );
  return new;
end;
$function$;
