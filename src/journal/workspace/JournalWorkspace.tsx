import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  enrichLiveAccountsWithUserPrefs,
  resolveBeginningBalanceForScope,
  resolveReportedBalanceForScope,
} from "../lib/account-enrichment";
import { resolveJournalEquityView } from "../lib/equity-evidence";
import { inRange, sessionOf } from "../lib/format";
import { loadJournalGraph } from "../ledger/loadTrades";
import {
  DEFAULT_LIVE_FILTERS,
  FILTERS_KEY,
  HIDE_DEMO_KEY,
  isDemoTradeId,
  rangeBounds,
  readJson,
  readUserJson,
  sanitizeLiveFilters,
  writeJson,
  writeUserJson,
  type FilterPrefs,
} from "../lib/storage";
import {
  nextJournalLoadGeneration,
  shouldApplyJournalLoad,
} from "./journal-load-fence";

export type JournalMode = "demo" | "live" | "empty";

export interface JournalAccount {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  beginningBalance: number | null;
  reportedBalance: number | null;
  reportedAsOf: string | null;
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
  equity: bigint | null;
  equityAvailable: boolean;
  reconciliationState: ReturnType<typeof resolveJournalEquityView>["reconciliationState"];
  missingReviews: Set<string>;
  demoLabel: typeof DEMO_WORKSPACE_LABEL;
}

const JournalWorkspaceContext = createContext<JournalWorkspaceValue | null>(null);

export function JournalWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const loadGenerationRef = useRef(0);

  const [liveTrades, setLiveTrades] = useState<TradeInput[]>([]);
  const [liveAccounts, setLiveAccounts] = useState<JournalAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoHidden, setDemoHidden] = useState(() => readJson<boolean>(HIDE_DEMO_KEY, false));
  const [filters, setFilters] = useState<FilterPrefs>(() => DEFAULT_LIVE_FILTERS);

  useEffect(() => {
    if (!userId) {
      setFilters(DEFAULT_LIVE_FILTERS);
      return;
    }
    const stored = readUserJson(FILTERS_KEY, userId, DEFAULT_LIVE_FILTERS);
    setFilters(sanitizeLiveFilters(stored, [], "live"));
  }, [userId]);

  const loadLive = useCallback(async () => {
    const expectedUserId = userId;
    const expectedGeneration = loadGenerationRef.current;

    if (!expectedUserId) {
      setLiveTrades([]);
      setLiveAccounts([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await loadJournalGraph({
      mode: "live",
      userId: expectedUserId,
      client: supabase as never,
    });

    if (
      !shouldApplyJournalLoad(
        expectedUserId,
        expectedGeneration,
        userId,
        loadGenerationRef.current,
      )
    ) {
      return;
    }

    if (!result.ok) {
      setError(result.error ?? "Journal data could not be loaded.");
      setLiveTrades([]);
      setLiveAccounts([]);
      setLoading(false);
      return;
    }

    setLiveTrades(result.trades.filter((trade) => !isDemoTradeId(trade.id)));
    setLiveAccounts(
      enrichLiveAccountsWithUserPrefs(
        result.accounts.map((account) => ({ ...account })),
        expectedUserId,
      ),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadGenerationRef.current = nextJournalLoadGeneration(loadGenerationRef.current);
    setLiveTrades([]);
    setLiveAccounts([]);
    setError(null);
    setLoading(Boolean(userId));
    void loadLive();
  }, [userId, loadLive]);

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
    beginningBalance: null,
    reportedBalance: null,
    reportedAsOf: null,
  };

  const accounts: readonly JournalAccount[] =
    mode === "demo" ? DEMO_ACCOUNTS : liveAccounts.length > 0 ? liveAccounts : [fallbackLiveAccount];

  const effectiveFilters = useMemo(
    () =>
      sanitizeLiveFilters(
        filters,
        accounts.map((account) => account.id),
        mode,
      ),
    [filters, accounts, mode],
  );

  useEffect(() => {
    if (
      effectiveFilters.accountId !== filters.accountId ||
      effectiveFilters.range !== filters.range
    ) {
      setFilters(effectiveFilters);
      if (userId) writeUserJson(FILTERS_KEY, userId, effectiveFilters);
    }
  }, [effectiveFilters, filters.accountId, filters.range, userId]);

  const persistFilters = (next: FilterPrefs) => {
    const sanitized = sanitizeLiveFilters(
      next,
      accounts.map((account) => account.id),
      mode,
    );
    setFilters(sanitized);
    if (userId) writeUserJson(FILTERS_KEY, userId, sanitized);
  };

  const activeRange =
    mode === "demo" && effectiveFilters.range === "augustDemo"
      ? "augustDemo"
      : effectiveFilters.range === "augustDemo"
        ? DEFAULT_LIVE_FILTERS.range
        : effectiveFilters.range;

  const { from, to } = rangeBounds(activeRange);

  const trades = useMemo(() => {
    return allTrades.filter((trade) => {
      if (effectiveFilters.accountId !== "all" && trade.accountId !== effectiveFilters.accountId) {
        return false;
      }
      if (effectiveFilters.asset !== "all" && trade.assetClass !== effectiveFilters.asset) {
        return false;
      }
      return inRange(sessionOf(trade), from, to);
    });
  }, [allTrades, effectiveFilters.accountId, effectiveFilters.asset, from, to]);

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

  const beginningBalance = resolveBeginningBalanceForScope(accounts, effectiveFilters.accountId);
  const reported = resolveReportedBalanceForScope(accounts, effectiveFilters.accountId);
  const equityView = resolveJournalEquityView({
    beginningBalance,
    reportedBalance: reported.reportedBalance,
    reportedAsOf: reported.reportedAsOf,
    realizedPnl: metrics.netPnl,
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
    persistFilters({ ...effectiveFilters, range: "all", accountId: "all" });
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
    selectedAccountId: effectiveFilters.accountId,
    range: activeRange,
    asset: effectiveFilters.asset,
    setAccountId: (accountId) => persistFilters({ ...effectiveFilters, accountId }),
    setRange: (range) => persistFilters({ ...effectiveFilters, range }),
    setAsset: (asset) => persistFilters({ ...effectiveFilters, asset }),
    accounts,
    dataQualityCount,
    dataQualityIssues,
    hideDemo,
    showDemo,
    demoHidden,
    refresh: loadLive,
    onLiveTradeSaved,
    processScore,
    equity: equityView.equity,
    equityAvailable: equityView.equityAvailable,
    reconciliationState: equityView.reconciliationState,
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
