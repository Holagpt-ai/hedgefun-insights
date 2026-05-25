-- 1. Remove the unintended INSERT policy on chatbot_sessions
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.chatbot_sessions;

-- 2. Add explicit restrictive deny policies on subscriptions for writes by non-service-role
CREATE POLICY "Block client inserts on subscriptions"
ON public.subscriptions
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Block client updates on subscriptions"
ON public.subscriptions
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on subscriptions"
ON public.subscriptions
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 3. Add explicit restrictive deny policies on user_roles to prevent any client-side privilege escalation
CREATE POLICY "Block client inserts on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Block client updates on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);