CREATE OR REPLACE FUNCTION public._tmp_invoke_v2(p_symbol text, p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_secret text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='sync_secret' LIMIT 1;
  SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/analyze-watchlist-tickers-v2',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    body := jsonb_build_object('record', jsonb_build_object('symbol', p_symbol, 'user_id', p_user_id))
  ) INTO v_req;
  RETURN v_req;
END;$$;
REVOKE ALL ON FUNCTION public._tmp_invoke_v2(text,uuid) FROM public, anon, authenticated;