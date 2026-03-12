
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  subject text,
  message text,
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON public.contact_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
