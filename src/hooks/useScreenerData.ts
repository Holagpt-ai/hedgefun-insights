import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ScreenerRow {
  symbol: string;
  company_name: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  rvol: number | null;
  float_shares: number | null;
  gap_percent: number | null;
  market_cap: number | null;
  updated_at: string;
}

export function useScreenerData(tabId: string) {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!tabId) return;
    setLoading(true);

    supabase
      .from("screener_results")
      .select("symbol,company_name,price,change_percent,volume,avg_volume,rvol,float_shares,gap_percent,market_cap,updated_at")
      .eq("tab_id", tabId)
      .order("rvol", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) {
          setRows(data as ScreenerRow[]);
          if (data.length > 0) setLastUpdated(data[0].updated_at);
        }
        setLoading(false);
      });
  }, [tabId]);

  return { rows, loading, lastUpdated };
}
