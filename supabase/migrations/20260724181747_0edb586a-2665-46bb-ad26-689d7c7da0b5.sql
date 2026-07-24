CREATE OR REPLACE FUNCTION public.trigger_watchlist_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_count integer;
  v_secret       text;
  v_request_id   bigint;
BEGIN
  SELECT count(*) INTO v_secret_count FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE WARNING 'trigger_watchlist_analysis: expected 1 vault secret sync_secret, found %; skipping', v_secret_count;
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  SELECT net.http_post(
    url     := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers-v2',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body    := jsonb_build_object('record', jsonb_build_object('symbol', NEW.symbol, 'user_id', NEW.user_id))
  ) INTO v_request_id;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public._tmp_invoke_v2(text, uuid);