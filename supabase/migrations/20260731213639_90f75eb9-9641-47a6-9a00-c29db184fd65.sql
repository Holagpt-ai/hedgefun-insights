DROP POLICY IF EXISTS "Users can manage own notes" ON public.journal_notes;

CREATE POLICY "Users can manage own notes"
ON public.journal_notes
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.journal_trades t
    WHERE t.id = journal_notes.trade_id AND t.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.journal_trades t
    WHERE t.id = journal_notes.trade_id AND t.user_id = auth.uid()
  )
);