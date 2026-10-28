import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { withTimeout } from "@/lib/async/with-timeout";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { fetchActiveLateSessionHandoffs } from "@/lib/am-inbox/late-session-handoff-client";
import { mapPersistedLateSessionRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import type { AmInboxLateSessionView } from "@/lib/am-inbox/late-session-continuation-types";

/** Bounded wait for large Monday→Tuesday RPC payloads on mobile networks. */
export const LATE_SESSION_HANDOFF_FETCH_TIMEOUT_MS = 25_000;

const EMPTY_VIEW = (amSessionDate: string): AmInboxLateSessionView => ({
  asOfSessionDate: amSessionDate,
  candidates: [],
  qualifiedCandidates: [],
  expiredCount: 0,
    funnel: {
      detectedCount: 0,
      qualifiedCount: 0,
      priorityCount: 0,
      displayedCount: 0,
      displayUsesQualifiedFallback: false,
    },
});

export async function loadAmInboxLateSessionViewForDate(
  amSessionDate: string,
): Promise<AmInboxLateSessionView> {
  const rows = await withTimeout(
    fetchActiveLateSessionHandoffs(amSessionDate),
    LATE_SESSION_HANDOFF_FETCH_TIMEOUT_MS,
    "late_session_handoff_list_active_v1",
  );
  const contexts = rows.map((row) => mapPersistedLateSessionRow(row, amSessionDate));
  return buildAmInboxLateSessionViewFromContexts(amSessionDate, contexts, {
    mirrorCollapsedToSessionStorage: false,
  });
}

export function useAmInboxLateSessionHandoffs(amSessionDate: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["am-inbox-late-session-handoffs", user?.id ?? null, amSessionDate],
    enabled: !!user?.id && !!amSessionDate,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
    queryFn: () => loadAmInboxLateSessionViewForDate(amSessionDate),
    placeholderData: (previousData) => {
      if (previousData?.asOfSessionDate === amSessionDate) return previousData;
      return undefined;
    },
  });
}

export { EMPTY_VIEW as emptyAmInboxLateSessionView };
