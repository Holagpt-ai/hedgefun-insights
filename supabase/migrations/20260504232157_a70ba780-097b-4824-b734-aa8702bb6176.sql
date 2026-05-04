DROP POLICY IF EXISTS "Users can read own sessions" ON public.chatbot_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.chatbot_sessions;

CREATE POLICY "Users can read own sessions"
ON public.chatbot_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
ON public.chatbot_sessions
FOR UPDATE
USING (auth.uid() = user_id);