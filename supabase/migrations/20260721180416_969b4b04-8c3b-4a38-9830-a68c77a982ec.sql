-- W2-R1 final retirement: remove the obsolete Vault NEXT credential.
DO $cmd$
DECLARE
  v_canonical_count integer;
  v_next_count      integer;
BEGIN
  SELECT count(*)
  INTO v_canonical_count
  FROM vault.secrets
  WHERE name = 'sync_secret';
  IF v_canonical_count <> 1 THEN
    RAISE EXCEPTION 'w2r1_retire: canonical_row_invalid';
  END IF;
  SELECT count(*)
  INTO v_next_count
  FROM vault.secrets
  WHERE name = 'sync_secret_next';
  IF v_next_count <> 1 THEN
    RAISE EXCEPTION 'w2r1_retire: next_row_invalid';
  END IF;
  DELETE FROM vault.secrets
  WHERE name = 'sync_secret_next';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'w2r1_retire: next_delete_failed';
  END IF;
END;
$cmd$;