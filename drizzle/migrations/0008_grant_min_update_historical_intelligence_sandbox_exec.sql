-- Minimum additional privileges required by the tested Historical Intelligence
-- repositories: UPDATE only, and only on the three tables whose SQL issues UPDATE.
-- securities: ON CONFLICT (security_id) DO UPDATE
-- security_symbol_history: UPDATE ... SET effective_to (interval closing)
-- security_backfill_jobs: UPDATE ... SET state/cursor/checkpoint metadata
-- No DELETE, no TRUNCATE, no REFERENCES, no TRIGGER, no anon/authenticated changes,
-- no service_role changes. RLS remains enabled with zero policies.
GRANT UPDATE ON public.securities TO sandbox_exec;
GRANT UPDATE ON public.security_symbol_history TO sandbox_exec;
GRANT UPDATE ON public.security_backfill_jobs TO sandbox_exec;

GRANT UPDATE ON public.securities TO sandbox_exec_zcjptaolpumhtlwhlemq;
GRANT UPDATE ON public.security_symbol_history TO sandbox_exec_zcjptaolpumhtlwhlemq;
GRANT UPDATE ON public.security_backfill_jobs TO sandbox_exec_zcjptaolpumhtlwhlemq;