-- Harden chatbot_sessions policies: exclude NULL user_id rows from client access, and add explicit deny-insert for clients
DROP POLICY IF EXISTS "Users can read own sessions" ON public.chatbot_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.chatbot_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.chatbot_sessions;

CREATE POLICY "Users can read own sessions"
ON public.chatbot_sessions FOR SELECT
TO authenticated
USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
ON public.chatbot_sessions FOR UPDATE
TO authenticated
USING (user_id IS NOT NULL AND auth.uid() = user_id)
WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
ON public.chatbot_sessions FOR DELETE
TO authenticated
USING (user_id IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Block client inserts on chatbot_sessions"
ON public.chatbot_sessions AS RESTRICTIVE FOR INSERT
TO anon, authenticated
WITH CHECK (false);

-- Remove redundant/risky JWT-claim service role policy on subscribers (service_role bypasses RLS natively)
DROP POLICY IF EXISTS "Service role manages subscribers" ON public.subscribers;

-- Add explicit deny policies for client write paths on subscribers
CREATE POLICY "Block client inserts on subscribers"
ON public.subscribers AS RESTRICTIVE FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Block client updates on subscribers"
ON public.subscribers AS RESTRICTIVE FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on subscribers"
ON public.subscribers AS RESTRICTIVE FOR DELETE
TO anon, authenticated
USING (false);