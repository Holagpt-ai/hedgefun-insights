-- Batch 27: bound replace_radar_v22_candidates_v1 statement time for high-frequency publishes.
-- Complements set-based event insert (20261015143000). Requires separate production apply.

ALTER FUNCTION public.replace_radar_v22_candidates_v1(
  uuid, date, text, timestamptz, jsonb, jsonb, boolean, timestamptz, timestamptz,
  text, text, integer, text, timestamptz, boolean
) SET statement_timeout = '120s';

NOTIFY pgrst, 'reload schema';
