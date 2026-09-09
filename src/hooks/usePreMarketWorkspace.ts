import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { validateWorkspace } from "@/lib/pre-market/builders";
import { mergeWorkspaceLastKnownGood } from "@/lib/pre-market/last-known-good";
import type { PreMarketWorkspaceResponse } from "@/types/pre-market";

const REFRESH_MS = 60_000;

export interface UsePreMarketWorkspaceResult {
  /** Last successful, contract-validated payload (kept during background refetch). */
  data: PreMarketWorkspaceResponse | null;
  /** True only before any successful response exists. */
  isLoading: boolean;
  isFetching: boolean;
  /** First-request failure — the page is unavailable, not empty. */
  isUnavailable: boolean;
  /** Background refresh failed while a previous payload is still displayed. */
  isStaleUpdateFailed: boolean;
  /** ISO time of the payload currently rendered. */
  dataAsOf: string | null;
  retry: () => void;
  isAuthenticated: boolean;
}

export function usePreMarketWorkspace(): UsePreMarketWorkspaceResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const queryKey = ["pre-market-workspace", userId] as const;

  const query = useQuery<PreMarketWorkspaceResponse>({
    // Stable key derived from authenticated identity, not request input.
    queryKey,
    enabled: !!userId,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-pre-market-workspace", {
        body: {},
      });
      if (error) throw new Error("WORKSPACE_UNAVAILABLE");
      const validated = validateWorkspace(data);
      if (!validated) throw new Error("WORKSPACE_CONTRACT_INVALID");
      const previous = queryClient.getQueryData<PreMarketWorkspaceResponse>(queryKey);
      return mergeWorkspaceLastKnownGood(previous ?? null, validated);
    },
  });

  const retry = useCallback(() => {
    void query.refetch();
  }, [query]);

  const data = query.data ?? null;

  return useMemo(
    () => ({
      data,
      isLoading: !!userId && query.isLoading,
      isFetching: query.isFetching,
      isUnavailable: !!userId && query.isError && !data,
      isStaleUpdateFailed: query.isError && !!data,
      dataAsOf: data?.server_now ?? null,
      retry,
      isAuthenticated: !!userId,
    }),
    [data, userId, query.isLoading, query.isFetching, query.isError, retry],
  );
}
