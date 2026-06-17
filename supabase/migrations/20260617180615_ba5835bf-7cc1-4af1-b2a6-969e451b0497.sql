CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_journal_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_total   integer;
  v_wins    integer;
  v_losses  integer;
  v_wash    integer;
  v_win_rate numeric;
  v_avg_win  numeric;
  v_avg_loss numeric;
  v_total_pnl numeric;
  v_largest_win numeric;
  v_largest_loss numeric;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.journal_trades
  WHERE user_id = p_user_id AND status = 'closed';

  SELECT
    COUNT(*) FILTER (WHERE return_dollars > 0),
    COUNT(*) FILTER (WHERE return_dollars < 0),
    COUNT(*) FILTER (WHERE is_wash = true),
    COALESCE(AVG(return_dollars) FILTER (WHERE return_dollars > 0), 0),
    COALESCE(AVG(return_dollars) FILTER (WHERE return_dollars < 0), 0),
    COALESCE(SUM(return_dollars), 0),
    COALESCE(MAX(return_dollars), 0),
    COALESCE(MIN(return_dollars), 0)
  INTO v_wins, v_losses, v_wash, v_avg_win, v_avg_loss, v_total_pnl, v_largest_win, v_largest_loss
  FROM public.journal_trades
  WHERE user_id = p_user_id AND status = 'closed';

  v_win_rate := CASE WHEN v_total > 0 THEN v_wins::numeric / v_total ELSE 0 END;

  INSERT INTO public.journal_stats_cache (
    user_id, total_trades, wins, losses, wash_trades,
    win_rate, avg_win_dollars, avg_loss_dollars,
    total_pnl, largest_win, largest_loss, updated_at
  ) VALUES (
    p_user_id, v_total, v_wins, v_losses, v_wash,
    v_win_rate, v_avg_win, v_avg_loss,
    v_total_pnl, v_largest_win, v_largest_loss, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_trades     = EXCLUDED.total_trades,
    wins             = EXCLUDED.wins,
    losses           = EXCLUDED.losses,
    wash_trades      = EXCLUDED.wash_trades,
    win_rate         = EXCLUDED.win_rate,
    avg_win_dollars  = EXCLUDED.avg_win_dollars,
    avg_loss_dollars = EXCLUDED.avg_loss_dollars,
    total_pnl        = EXCLUDED.total_pnl,
    largest_win      = EXCLUDED.largest_win,
    largest_loss     = EXCLUDED.largest_loss,
    updated_at       = EXCLUDED.updated_at;
END;
$function$;