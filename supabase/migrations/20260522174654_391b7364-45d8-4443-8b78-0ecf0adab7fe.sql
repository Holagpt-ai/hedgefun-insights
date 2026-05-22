-- 1. Roles system
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2. Replace admin JWT-claim policies with has_role()
DROP POLICY IF EXISTS "Admin read affiliate applications" ON public.affiliate_applications;
CREATE POLICY "Admins can read affiliate applications" ON public.affiliate_applications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin read contact submissions" ON public.contact_submissions;
CREATE POLICY "Admins can read contact submissions" ON public.contact_submissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "No public read newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Admins can read newsletter subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Tighten chatbot_sessions: no more anon NULL user_id inserts via client.
-- Anonymous chat continues to work via the chat edge function which uses the service role and bypasses RLS.
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.chatbot_sessions;
CREATE POLICY "Users can insert own sessions" ON public.chatbot_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);