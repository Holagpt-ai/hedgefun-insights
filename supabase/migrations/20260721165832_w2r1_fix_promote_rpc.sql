
-- W2-R1 fix: remove invalid min(uuid) from the temporary promotion RPC.

CREATE OR REPLACE FUNCTION public.w2r1_promote_vault_canonical(p_secret text)

RETURNS boolean

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $cmd$

DECLARE

  v_canonical_count integer;

  v_next_count      integer;

  v_canonical_id    uuid;

BEGIN

  IF p_secret IS NULL OR length(p_secret) < 24 THEN

    RAISE EXCEPTION 'w2r1_promote: invalid_secret';

  END IF;

  SELECT count(*)

  INTO v_canonical_count

  FROM vault.secrets

  WHERE name = 'sync_secret';

  IF v_canonical_count <> 1 THEN

    RAISE EXCEPTION 'w2r1_promote: canonical_row_invalid';

  END IF;

  SELECT id

  INTO STRICT v_canonical_id

  FROM vault.secrets

  WHERE name = 'sync_secret';

  SELECT count(*)

  INTO v_next_count

  FROM vault.secrets

  WHERE name = 'sync_secret_next';

  IF v_next_count <> 1 THEN

    RAISE EXCEPTION 'w2r1_promote: next_row_invalid';

  END IF;

  PERFORM vault.update_secret(v_canonical_id, p_secret);

  RETURN true;

END;

$cmd$;

REVOKE ALL ON FUNCTION public.w2r1_promote_vault_canonical(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.w2r1_promote_vault_canonical(text) FROM anon;

REVOKE ALL ON FUNCTION public.w2r1_promote_vault_canonical(text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.w2r1_promote_vault_canonical(text) TO service_role;
