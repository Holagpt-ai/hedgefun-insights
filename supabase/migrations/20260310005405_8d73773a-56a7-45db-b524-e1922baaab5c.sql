-- Fix: Enable RLS on agentic_seo_log
ALTER TABLE agentic_seo_log ENABLE ROW LEVEL SECURITY;

-- Public read policy for agentic_seo_log (admin-only writes will be added later)
CREATE POLICY "Public read seo log" ON agentic_seo_log FOR SELECT USING (true);

-- Fix: Set search_path on functions
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SET search_path = public;