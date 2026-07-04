import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Trade {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  entry_date: string;
  exit_date: string | null;
  status: "open" | "closed";
  notes: string | null;
  setup_type: string | null;
  emotion: number | null;
  confidence: number | null;
  pnl: number | null;
  created_at: string;
  updated_at: string;
}

export interface TradeTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TradeInsert {
  symbol: string;
  side: "buy" | "sell";
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  entry_date: string;
  exit_date?: string | null;
  status?: "open" | "closed";
  notes?: string;
  setup_type?: string;
  emotion?: number;
  confidence?: number;
  tag_ids?: string[];
}

export function useJournalTrades() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const tradesQuery = useQuery({
    queryKey: ["journal-trades", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user!.id)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data as Trade[];
    },
  });

  const tagsQuery = useQuery({
    queryKey: ["journal-tags", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_tags")
        .select("*")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return data as TradeTag[];
    },
  });

  const tagAssignmentsQuery = useQuery({
    queryKey: ["journal-tag-assignments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_tag_assignments")
        .select("*");
      if (error) throw error;
      return data as { id: string; trade_id: string; tag_id: string }[];
    },
  });

  const addTrade = useMutation({
    mutationFn: async (trade: TradeInsert) => {
      const { tag_ids, ...tradeData } = trade;
      const status = trade.exit_price != null ? "closed" : "open";
      const { data, error } = await supabase
        .from("trades")
        .insert({ ...tradeData, status, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      if (tag_ids && tag_ids.length > 0) {
        const { error: tagError } = await supabase
          .from("trade_tag_assignments")
          .insert(tag_ids.map((tag_id) => ({ trade_id: data.id, tag_id, user_id: user!.id })));
        if (tagError) throw tagError;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-trades"] });
      qc.invalidateQueries({ queryKey: ["journal-tag-assignments"] });
      toast.success("Trade added");
    },
    onError: (e) => toast.error(e.message),
  });

  const closeTrade = useMutation({
    mutationFn: async ({ id, exit_price, exit_date }: { id: string; exit_price: number; exit_date: string }) => {
      const { error } = await supabase
        .from("trades")
        .update({ exit_price, exit_date, status: "closed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-trades"] });
      toast.success("Trade closed");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTrade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-trades"] });
      qc.invalidateQueries({ queryKey: ["journal-tag-assignments"] });
      toast.success("Trade deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const addTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from("trade_tags")
        .insert({ name, color, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-tags"] });
      toast.success("Tag created");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    trades: tradesQuery.data ?? [],
    tags: tagsQuery.data ?? [],
    tagAssignments: tagAssignmentsQuery.data ?? [],
    isLoading: tradesQuery.isLoading || tagsQuery.isLoading,
    addTrade,
    closeTrade,
    deleteTrade,
    addTag,
  };
}
