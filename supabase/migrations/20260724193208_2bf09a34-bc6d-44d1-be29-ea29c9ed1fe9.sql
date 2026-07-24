DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  PERFORM net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers-v2',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body := jsonb_build_object('record', jsonb_build_object('symbol','VRAX','user_id','671a49ea-6344-48b3-b91e-22eb62353ca1'))
  );
  PERFORM net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers-v2',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body := jsonb_build_object('record', jsonb_build_object('symbol','FCUV','user_id','671a49ea-6344-48b3-b91e-22eb62353ca1'))
  );
END $$;