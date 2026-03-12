
CREATE TABLE public.affiliate_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  website_url text,
  audience_size text,
  promotion_plan text,
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON public.affiliate_applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
