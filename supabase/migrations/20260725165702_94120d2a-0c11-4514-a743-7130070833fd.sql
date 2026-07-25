-- Revoke anon read; keep authenticated read via existing policy.
REVOKE SELECT ON public.catalyst_events FROM anon;

-- Restrict the SELECT policy to authenticated role explicitly.
DROP POLICY IF EXISTS "catalyst_events public read" ON public.catalyst_events;
CREATE POLICY "catalyst_events authenticated read"
  ON public.catalyst_events FOR SELECT
  TO authenticated
  USING (true);