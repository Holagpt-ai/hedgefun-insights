-- W2-R1-1C: temporary SECURITY DEFINER RPC to stage the sync_secret_next
-- Vault row from a parameterized argument. Contains no secret values.
-- Dropped by the W2-R1-1C cleanup migration after successful staging.
-- Intentionally CREATE (not CREATE OR REPLACE): this must fail if any
-- function already occupies this identity; it must never overwrite one.

CREATE FUNCTION public.w2r1_stage_sync_secret_next(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $cmd$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  -- Fixed-message validation; the parameter never appears in any exception.
  IF p_secret IS NULL OR length(p_secret) < 24 THEN
    RAISE EXCEPTION 'w2r1_stage: invalid_secret';
  END IF;

  SELECT count(*) INTO v_count
  FROM vault.secrets
  WHERE name = 'sync_secret_next';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'w2r1_stage: next_row_exists';
  END IF;

  v_id := vault.create_secret(p_secret, 'sync_secret_next');
  RETURN v_id IS NOT NULL;
END;
$cmd$;

REVOKE ALL ON FUNCTION public.w2r1_stage_sync_secret_next(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.w2r1_stage_sync_secret_next(text) FROM anon;
REVOKE ALL ON FUNCTION public.w2r1_stage_sync_secret_next(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.w2r1_stage_sync_secret_next(text) TO service_role;