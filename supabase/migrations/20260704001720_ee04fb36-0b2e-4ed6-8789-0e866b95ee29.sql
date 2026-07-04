
ALTER TABLE public.trade_tag_assignments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.trade_tag_assignments tta
SET user_id = t.user_id
FROM public.trades t
WHERE tta.trade_id = t.id AND tta.user_id IS NULL;

DELETE FROM public.trade_tag_assignments WHERE user_id IS NULL;

ALTER TABLE public.trade_tag_assignments ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS trade_tag_assignments_user_id_idx ON public.trade_tag_assignments(user_id);

DROP POLICY IF EXISTS "Users can manage own tag assignments" ON public.trade_tag_assignments;
DROP POLICY IF EXISTS "Users manage own tag assignments" ON public.trade_tag_assignments;
DROP POLICY IF EXISTS "Users can view own tag assignments" ON public.trade_tag_assignments;
DROP POLICY IF EXISTS "Users can insert own tag assignments" ON public.trade_tag_assignments;
DROP POLICY IF EXISTS "Users can delete own tag assignments" ON public.trade_tag_assignments;
DROP POLICY IF EXISTS "Users can update own tag assignments" ON public.trade_tag_assignments;

CREATE POLICY "Users manage own tag assignments"
ON public.trade_tag_assignments
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.trades t WHERE t.id = trade_id AND t.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.trade_tags tg WHERE tg.id = tag_id AND tg.user_id = auth.uid())
);
