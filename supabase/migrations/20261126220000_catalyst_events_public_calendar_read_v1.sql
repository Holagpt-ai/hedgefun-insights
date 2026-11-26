-- Calendar V4 + homepage widget: guests need provider-reported catalyst rows.
-- Prepared for Lovable apply only (not executed from Cursor).
-- Narrower than the original public policy: anon may read only verified provider rows.

GRANT SELECT ON public.catalyst_events TO anon;

DROP POLICY IF EXISTS "catalyst_events anon calendar read" ON public.catalyst_events;

CREATE POLICY "catalyst_events anon calendar read"
  ON public.catalyst_events
  FOR SELECT
  TO anon
  USING (verification_state = 'provider_reported');

COMMENT ON POLICY "catalyst_events anon calendar read" ON public.catalyst_events IS
  'Public /calendar and homepage catalyst tab for unauthenticated visitors.';