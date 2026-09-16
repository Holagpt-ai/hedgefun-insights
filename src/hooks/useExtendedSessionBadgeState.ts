import { useEffect, useState } from "react";
import {
  EXTENDED_SESSION_BADGE_POLL_MS,
  getExtendedSessionBadgeState,
  type ExtendedSessionBadgeState,
} from "@/lib/extended-session-badge";

/** Re-evaluates extended-session badge state on a low-frequency timer. */
export function useExtendedSessionBadgeState(
  intervalMs: number = EXTENDED_SESSION_BADGE_POLL_MS,
): ExtendedSessionBadgeState {
  const [state, setState] = useState<ExtendedSessionBadgeState>(() =>
    getExtendedSessionBadgeState(new Date()),
  );

  useEffect(() => {
    const tick = () => setState(getExtendedSessionBadgeState(new Date()));
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return state;
}
