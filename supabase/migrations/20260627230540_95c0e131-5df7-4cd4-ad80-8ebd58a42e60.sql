DROP POLICY IF EXISTS "Public read seo log" ON public.agentic_seo_log;

CREATE POLICY "Admins can read seo log"
  ON public.agentic_seo_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));