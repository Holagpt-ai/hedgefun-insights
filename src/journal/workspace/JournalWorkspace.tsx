import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateTrades,
  averageProcessScore,
  calculateTrade,
  dailyMetrics,
  derivedJournalEquity,
  reconcileBalances,
  type AggregateMetrics,
  type DailyMetric,
  type TradeCalculation,
  type TradeInput,
} from "../calc";
import {
  AUGUST_DEMO_TRADES,
  DEMO_ACCOUNTS,
  DEMO_MISSING_REVIEWS,
  DEMO_WORKSPACE_LABEL,
} from "../demo/august-fixtures";
import { inRange, sessionOf } from "../lib/format";
import { loadJournalGraph } from "../ledger/loadTrades";
import {
  DEFAULT_FILTERS,
  FILTERS_KEY,
  HIDE_DEMO_KEY,
  isDemoTradeId,
  rangeBounds,
  readJson,
  writeJson,
  type FilterPrefs,
} from "../lib/storage";

export type JournalMode = "demo" | "live" | "empty";

export interface JournalAccount {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  beginningBalance: number;
  reportedBalance: number;
  reportedAsOf: string;
}

export interface DataQualityIssue {
  key: string;
  count: number;
}

interface JournalWorkspaceValue {
  mode: JournalMode;
  loading: boolean;
  error: string | null;
  allTrades: TradeInput[];
  trades: TradeInput[];
  calculations: TradeCalculation[];
  metrics: AggregateMetrics;
  daily: DailyMetric[];
  selectedAccountId: string;
  range: FilterPrefs["range"];
  asset: FilterPrefs["asset"];
  setAccountId: (id: string) => void;
  setRange: (range: FilterPrefs["range"]) => void;
  setAsset: (asset: FilterPrefs["asset"]) => void;
  accounts: readonly JournalAccount[];
  dataQualityCount: number;
  dataQualityIssues: DataQualityIssue[];
  hideDemo: () => void;
  showDemo: () => void;
  demoHidden: boolean;
  refresh: () => Promise<void>;
  onLiveTradeSaved: () => Promise<void>;
  processScore: number | null;
  equity: bigint;
  reconciliationState: ReturnType<typeof reconcileBalances>;
  missingReviews: Set<string>;
  demoLabel: typeof DEMO_WORKSPACE_LABEL;
}

const JournalWorkspaceContext = createContext<JournalWorkspaceValue | null>(null);

export function JournalWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [liveTrades, setLiveTrades] = useState<TradeInput[]>([]);
  const [liveAccounts, setLiveAccounts] = useState<JournalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoHidden, setDemoHidden] = useState(() => readJson<boolean>(HIDE_DEMO_KEY, false));
  const [filters, setFilters] = useState<FilterPrefs>(() => readJson(FILTERS_KEY, DEFAULT_FILTERS));

  const loadLive = useCallback(async () => {
    if (!user) {
      setLiveTrades([]);
      setLiveAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await loadJournalGraph({
      mode: "live",
      userId: user.id,
      client: supabase as never,
    });
    if (!result.ok) {
      setError(result.error ?? "Journal data could not be loaded.");
      setLiveTrades([]);
      setLiveAccounts([]);
      setLoading(false);
      return;
    }
    setLiveTrades(result.trades.filter((trade) => !isDemoTradeId(trade.id)));
    setLiveAccounts(result.accounts);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  const mode: JournalMode = useMemo(() => {
    if (liveTrades.length > 0) return "live";
    if (!demoHidden) return "demo";
    return "empty";
  }, [liveTrades.length, demoHidden]);

  const allTrades = mode === "demo" ? AUGUST_DEMO_TRADES : liveTrades;
  const fallbackLiveAccount: JournalAccount = {
    id: "live-default",
    name: "Primary",
    type: "personal",
    baseCurrency: "USD",
    beginningBalance: 0,
    reportedBalance: 0,
    reportedAsOf: new Date().toISOString(),
  };
  const accounts: readonly JournalAccount[] =
    mode === "demo" ? DEMO_ACCOUNTS : liveAccounts.length > 0 ? liveAccounts : [fallbackLiveAccount];

  const persistFilters = (next: FilterPrefs) => {
    setFilters(next);
    writeJson(FILTERS_KEY, next);
  };

  const { from, to } = rangeBounds(mode === "demo" && filters.range === "augustDemo" ? "augustDemo" : filters.range);

  const trades = useMemo(() => {
    return allTrades.filter((trade) => {
      if (filters.accountId !== "all" && trade.accountId !== filters.accountId) return false;
      if (filters.asset !== "all" && trade.assetClass !== filters.asset) return false;
      return inRange(sessionOf(trade), from, to);
    });
  }, [allTrades, filters.accountId, filters.asset, from, to]);

  const calculations = useMemo(() => trades.map(calculateTrade), [trades]);
  const metrics = useMemo(() => aggregateTrades(trades), [trades]);
  const daily = useMemo(() => dailyMetrics(trades), [trades]);
  const processScore = useMemo(() => averageProcessScore(trades), [trades]);

  const dataQualityIssues = useMemo<DataQualityIssue[]>(() => {
    const missingReviewDays = mode === "demo"
      ? DEMO_MISSING_REVIEWS.size
      : daily.filter((day) => day.tradeCount > 0 && !day.reviewComplete).length;
    const incompleteFees = calculations.filter((calc) => calc.calculationState === "incomplete").length;
    const openExposure = calculations.filter((calc) => calc.remainingQuantity > 0n).length;
    const excluded = metrics.excludedCount;
    return [
      { key: "missing_reviews", count: missingReviewDays },
      { key: "incomplete_fees", count: incompleteFees },
      { key: "open_exposure", count: openExposure },
      { key: "excluded", count: excluded },
    ].filter((issue) => issue.count > 0);
  }, [mode, daily, calculations, metrics.excludedCount]);

  const dataQualityCount = dataQualityIssues.reduce((sum, issue) => sum + issue.count, 0);

  const selectedAccount = accounts.find((account) => account.id === filters.accountId) ?? accounts[0];
  const equity = derivedJournalEquity({
    beginningBalance: selectedAccount?.beginningBalance ?? 0,
    cashFlows: [],
    realizedPnl: metrics.netPnl,
  });
  const reconciliationState = reconcileBalances({
    derivedEquity: equity,
    reportedBalance: selectedAccount?.reportedBalance ?? null,
    reportedAsOf: selectedAccount?.reportedAsOf,
  });

  const hideDemo = () => {
    setDemoHidden(true);
    writeJson(HIDE_DEMO_KEY, true);
  };
  const showDemo = () => {
    setDemoHidden(false);
    writeJson(HIDE_DEMO_KEY, false);
  };

  const onLiveTradeSaved = async () => {
    writeJson(HIDE_DEMO_KEY, true);
    setDemoHidden(true);
    persistFilters({ ...filters, range: "all", accountId: "all" });
    await loadLive();
  };

  const value: JournalWorkspaceValue = {
    mode,
    loading,
    error,
    allTrades,
    trades,
    calculations,
    metrics,
    daily,
    selectedAccountId: filters.accountId,
    range: filters.range,
    asset: filters.asset,
    setAccountId: (accountId) => persistFilters({ ...filters, accountId }),
    setRange: (range) => persistFilters({ ...filters, range }),
    setAsset: (asset) => persistFilters({ ...filters, asset }),
    accounts,
    dataQualityCount,
    dataQualityIssues,
    hideDemo,
    showDemo,
    demoHidden,
    refresh: loadLive,
    onLiveTradeSaved,
    processScore,
    equity,
    reconciliationState,
    missingReviews: mode === "demo" ? DEMO_MISSING_REVIEWS : new Set<string>(),
    demoLabel: DEMO_WORKSPACE_LABEL,
  };

  return <JournalWorkspaceContext.Provider value={value}>{children}</JournalWorkspaceContext.Provider>;
}

export function useJournalWorkspace(): JournalWorkspaceValue {
  const ctx = useContext(JournalWorkspaceContext);
  if (!ctx) throw new Error("useJournalWorkspace must be used within JournalWorkspaceProvider");
  return ctx;
}
