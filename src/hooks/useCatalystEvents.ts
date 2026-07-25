// React Query hooks for Catalyst events and per-user state.
// Owner ID for catalyst_user_state is always derived from the authenticated
// session — never from a client-provided field. RLS remains the ownership
// boundary.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent, CatalystUserStateRow } from "@/types/catalyst";
import { useAuth } from "@/contexts/AuthContext";

const CATALYST_SELECT =
  "id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, description, source_name, source_url, provider, related_symbols, facts, published_at";

interface UseCatalystEventsArgs {
  symbol?: string | null;
  // Fetch events either published within the last N days or scheduled within the next N days.
  recentDays?: number;
  upcomingDays?: number;
  limit?: number;
  enabled?: boolean;
}

export function useCatalystEvents(args: UseCatalystEventsArgs = {}) {
  const {
    symbol = null,
    recentDays = 3,
    upcomingDays = 30,
    limit = 500,
    enabled = true,
  } = args;

  return useQuery<CatalystEvent[]>({
    queryKey: ["catalyst_events", symbol, recentDays, upcomingDays, limit],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const recentFrom = new Date(now.getTime() - recentDays * 86_400_000).toISOString();
      const upcomingTo = new Date(now.getTime() + upcomingDays * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const upcomingFrom = now.toISOString().slice(0, 10);

      // Two OR'd windows: recent by published_at OR upcoming by event_date.
      let q = supabase
        .from("catalyst_events")
        .select(CATALYST_SELECT)
        .or(
          `and(published_at.gte.${recentFrom}),and(event_date.gte.${upcomingFrom},event_date.lte.${upcomingTo})`,
        )
        .order("event_date", { ascending: true })
        .limit(limit);

      if (symbol) q = q.eq("symbol", symbol);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as CatalystEvent[];
    },
  });
}

export function useCatalystUserState() {
  const { user } = useAuth();
  return useQuery<CatalystUserStateRow[]>({
    queryKey: ["catalyst_user_state", user?.id ?? null],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalyst_user_state")
        .select("id, event_id, saved_at, reviewed_at")
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as CatalystUserStateRow[];
    },
  });
}

async function upsertUserState(
  userId: string,
  eventId: string,
  patch: { saved_at?: string | null; reviewed_at?: string | null },
) {
  // NOTE: user_id is derived from the authenticated session, not from client
  // input. RLS enforces the ownership boundary regardless.
  const { data: existing, error: readErr } = await supabase
    .from("catalyst_user_state")
    .select("id, saved_at, reviewed_at")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  if (existing) {
    const { error } = await supabase
      .from("catalyst_user_state")
      .update(patch)
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("catalyst_user_state").insert({
      user_id: userId,
      event_id: eventId,
      saved_at: patch.saved_at ?? null,
      reviewed_at: patch.reviewed_at ?? null,
    });
    if (error) throw new Error(error.message);
  }
}

export function useToggleCatalystSaved() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; nextSaved: boolean }) => {
      if (!user) throw new Error("not_authenticated");
      await upsertUserState(user.id, input.eventId, {
        saved_at: input.nextSaved ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalyst_user_state"] }),
  });
}

export function useToggleCatalystReviewed() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; nextReviewed: boolean }) => {
      if (!user) throw new Error("not_authenticated");
      await upsertUserState(user.id, input.eventId, {
        reviewed_at: input.nextReviewed ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalyst_user_state"] }),
  });
}

/** Fetches the latest catalyst-events sync heartbeat (max updated_at). */
export function useCatalystLastSync() {
  return useQuery<string | null>({
    queryKey: ["catalyst_events_last_sync"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalyst_events")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) return null;
      const row = data?.[0] as { updated_at?: string } | undefined;
      return row?.updated_at ?? null;
    },
  });
}
