
-- 1. CONTACT SUBMISSIONS
DROP POLICY IF EXISTS "Allow anonymous insert" ON contact_submissions;
CREATE POLICY "Anyone can insert contact submissions" ON contact_submissions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Only admins can read contact submissions" ON contact_submissions;
CREATE POLICY "Only admins can read contact submissions" ON contact_submissions
  FOR SELECT USING (auth.jwt() ->> 'email' = 'carlos.acosta@holagpt.es');

-- 2. CHATBOT SESSIONS
DROP POLICY IF EXISTS "Users view own chat sessions" ON chatbot_sessions;

CREATE POLICY "Users can insert sessions" ON chatbot_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update sessions" ON chatbot_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own sessions" ON chatbot_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own sessions" ON chatbot_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- 3. WATCHLISTS - re-create with explicit WITH CHECK
DROP POLICY IF EXISTS "Users manage own watchlist" ON watchlists;
CREATE POLICY "Users manage own watchlist" ON watchlists
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. NEWSLETTER SUBSCRIBERS - drop public read
DROP POLICY IF EXISTS "Public read newsletter" ON newsletter_subscribers;
