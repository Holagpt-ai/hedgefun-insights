DO $$
DECLARE
  v_secret text;
  v_req    bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='sync_secret' LIMIT 1;
  SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers-v2',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body := jsonb_build_object('record', jsonb_build_object('symbol','SPCX','user_id','671a49ea-6344-48b3-b91e-22eb62353ca1'))
  ) INTO v_req;
  RAISE NOTICE 'r3_smoke_request_id=%', v_req;
END $$;