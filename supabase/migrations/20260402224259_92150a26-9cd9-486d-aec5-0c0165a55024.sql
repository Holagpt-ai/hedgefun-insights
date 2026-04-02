
-- 1. CONTACT SUBMISSIONS: Use app_metadata role check instead of hardcoded email
DROP POLICY IF EXISTS "Only admins can read contact submissions" ON contact_submissions;
DROP POLICY IF EXISTS "Admin read only" ON contact_submissions;
CREATE POLICY "Admin read contact submissions" ON contact_submissions
  FOR SELECT USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 2. NEWSLETTER SUBSCRIBERS: Add explicit deny-all SELECT policy
CREATE POLICY "No public read newsletter" ON newsletter_subscribers
  FOR SELECT USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 3. AFFILIATE APPLICATIONS: Add admin-only SELECT policy
CREATE POLICY "Admin read affiliate applications" ON affiliate_applications
  FOR SELECT USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- 4. CHATBOT SESSIONS: Tighten UPDATE to owner-only, tighten INSERT
DROP POLICY IF EXISTS "Users can update sessions" ON chatbot_sessions;
CREATE POLICY "Users can update own sessions" ON chatbot_sessions
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert sessions" ON chatbot_sessions;
CREATE POLICY "Users can insert own sessions" ON chatbot_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 5. CHATBOT SESSIONS: Tighten DELETE to owner-only (already done but re-confirm)
DROP POLICY IF EXISTS "Delete sessions" ON chatbot_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON chatbot_sessions;
CREATE POLICY "Users can delete own sessions" ON chatbot_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- 6. CHATBOT SESSIONS: Tighten SELECT
DROP POLICY IF EXISTS "Read sessions" ON chatbot_sessions;
DROP POLICY IF EXISTS "Users can read own sessions" ON chatbot_sessions;
CREATE POLICY "Users can read own sessions" ON chatbot_sessions
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- 7. TRADE TAG ASSIGNMENTS: Verify tag ownership too
DROP POLICY IF EXISTS "Users manage own trade tag assignments" ON trade_tag_assignments;
CREATE POLICY "Users manage own trade tag assignments" ON trade_tag_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trades WHERE trades.id = trade_tag_assignments.trade_id AND trades.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trade_tags WHERE trade_tags.id = trade_tag_assignments.tag_id AND trade_tags.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trades WHERE trades.id = trade_tag_assignments.trade_id AND trades.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trade_tags WHERE trade_tags.id = trade_tag_assignments.tag_id AND trade_tags.user_id = auth.uid())
  );
