-- W2-R1-1C cleanup: drop the temporary Vault-staging RPC.
-- The sync_secret_next Vault row is intentionally retained.
-- Intentionally no IF EXISTS: the RPC is proven present before cleanup;
-- its unexpected absence must fail this migration loudly.
DROP FUNCTION public.w2r1_stage_sync_secret_next(text);
