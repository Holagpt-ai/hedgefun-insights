import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { fetchActiveLateSessionHandoffs } from "@/lib/am-inbox/late-session-handoff-client";
import { mapPersistedLateSessionRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import type { AmInboxLateSessionView } from "@/lib/am-inbox/late-session-continuation-types";

const EMPTY_VIEW = (amSessionDate: string): AmInboxLateSessionView => ({
  asOfSessionDate: amSessionDate,
  candidates: [],
  expiredCount: 0,
});

export function useAmInboxLateSessionHandoffs(amSessionDate: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["am-inbox-late-session-handoffs", user?.id ?? null, amSessionDate],
    enabled: !!user?.id && !!amSessionDate,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const rows = await fetchActiveLateSessionHandoffs(amSessionDate);
      const contexts = rows.map((row) => mapPersistedLateSessionRow(row, amSessionDate));
      return buildAmInboxLateSessionViewFromContexts(amSessionDate, contexts);
    },
    placeholderData: (prev) => prev ?? EMPTY_VIEW(amSessionDate),
  });
}
