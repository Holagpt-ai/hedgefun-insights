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
  DEFAULT_FILTERS,
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
import { AsyncTimeoutError, withTimeout } from "@/lib/async/with-timeout";
import {
  nextJournalLoadGeneration,
  shouldApplyJournalLoad,
} from "./journal-load-fence";
import { JOURNAL_GRAPH_LOAD_TIMEOUT_MS } from "./journal-load-constants";

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

export type JournalLoadState =
  | "initial-loading"
  | "refreshing"
  | "ready"
  | "error"
  | "stale";

interface JournalWorkspaceValue {
  mode: JournalMode;
  /** True only during the first load for the signed-in user (not background refresh). */
  loading: boolean;
  loadState: JournalLoadState;
  refreshing: boolean;
  error: string | null;
  /** Set when a background refresh fails but prior same-user data is retained. */
  staleError: string | null;
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
  /** Mirrors `dataOwnerId` for retain-on-failure without re-binding `loadLive`. */
  const dataOwnerIdRef = useRef<string | null>(null);

  const [liveTrades, setLiveTrades] = useState<TradeInput[]>([]);
  const [liveAccounts, setLiveAccounts] = useState<JournalAccount[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [fetchInFlight, setFetchInFlight] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);
  const retainDataOnFailureRef = useRef(false);
  const [demoHidden, setDemoHidden] = useState(() => readJson<boolean>(HIDE_DEMO_KEY, false));
  const [filters, setFilters] = useState<FilterPrefs>(DEFAULT_LIVE_FILTERS);
  const [filtersUserId, setFiltersUserId] = useState<string | null>(null);
  const [demoDisplayFilters, setDemoDisplayFilters] = useState<FilterPrefs>(DEFAULT_FILTERS);

  const [trackedUserId, setTrackedUserId] = useState<string | null>(userId);
  if (userId !== trackedUserId) {
    setTrackedUserId(userId);
    setLiveTrades([]);
    setLiveAccounts([]);
    setDataOwnerId(null);
    dataOwnerIdRef.current = null;
    setFetchInFlight(Boolean(userId));
    setError(null);
    setStaleError(null);
    loadGenerationRef.current = nextJournalLoadGeneration(loadGenerationRef.current);
  }

  if (userId !== filtersUserId) {
    setFiltersUserId(userId);
    setFilters(
      userId ? readUserJson(FILTERS_KEY, userId, DEFAULT_LIVE_FILTERS) : DEFAULT_LIVE_FILTERS,
    );
  }

  const loadLive = useCallback(async () => {
    const expectedUserId = userId;
    if (!expectedUserId) {
      setLiveTrades([]);
      setLiveAccounts([]);
      setDataOwnerId(null);
      dataOwnerIdRef.current = null;
      setFetchInFlight(false);
      setError(null);
      setStaleError(null);
      return;
    }

    const expectedGeneration = nextJournalLoadGeneration(loadGenerationRef.current);
    loadGenerationRef.current = expectedGeneration;

    retainDataOnFailureRef.current = dataOwnerIdRef.current === expectedUserId;
    setFetchInFlight(true);
    if (!retainDataOnFailureRef.current) {
      setError(null);
      setStaleError(null);
    }

    let result: Awaited<ReturnType<typeof loadJournalGraph>>;
    try {
      result = await withTimeout(
        loadJournalGraph({
          mode: "live",
          userId: expectedUserId,
          client: supabase as never,
        }),
        JOURNAL_GRAPH_LOAD_TIMEOUT_MS,
        "journal_graph_load",
      );
    } catch (caught: unknown) {
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
      const message =
        caught instanceof AsyncTimeoutError
          ? "Journal data took too long to load. Check your connection and try again."
          : caught instanceof Error
            ? caught.message
            : "Journal data could not be loaded.";
      if (retainDataOnFailureRef.current) {
        setStaleError(message);
      } else {
        setError(message);
        setLiveTrades([]);
        setLiveAccounts([]);
        setDataOwnerId(null);
        dataOwnerIdRef.current = null;
      }
      setFetchInFlight(false);
      return;
    }

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
      const message = result.error ?? "Journal data could not be loaded.";
      if (retainDataOnFailureRef.current) {
        setStaleError(message);
      } else {
        setError(message);
        setLiveTrades([]);
        setLiveAccounts([]);
        setDataOwnerId(null);
        dataOwnerIdRef.current = null;
      }
      setFetchInFlight(false);
      return;
    }

    setLiveTrades(result.trades.filter((trade) => !isDemoTradeId(trade.id)));
    setLiveAccounts(
      enrichLiveAccountsWithUserPrefs(
        result.accounts.map((account) => ({ ...account })),
        expectedUserId,
      ),
    );
    setDataOwnerId(expectedUserId);
    dataOwnerIdRef.current = expectedUserId;
    setError(null);
    setStaleError(null);
    setFetchInFlight(false);
  }, [userId]);

  const loadLiveRef = useRef(loadLive);
  loadLiveRef.current = loadLive;

  useEffect(() => {
    void loadLiveRef.current();
  }, [userId]);

  const liveDataReady = dataOwnerId === userId && userId != null;
  const ownedLiveTrades = liveDataReady ? liveTrades : [];
  const ownedLiveAccounts = liveDataReady ? liveAccounts : [];
  const liveAccountsReady = liveDataReady && !fetchInFlight;
  const initialLoading = Boolean(userId) && fetchInFlight && !liveDataReady;
  const refreshing = Boolean(userId) && fetchInFlight && liveDataReady;

  const loadState: JournalLoadState = useMemo(() => {
    if (initialLoading) return "initial-loading";
    if (refreshing) return "refreshing";
    if (error && !liveDataReady) return "error";
    if (staleError && liveDataReady) return "stale";
    return "ready";
  }, [initialLoading, refreshing, error, staleError, liveDataReady]);

  const mode: JournalMode = useMemo(() => {
    if (ownedLiveTrades.length > 0) return "live";
    if (userId && error && !liveDataReady) return "empty";
    if (userId && !liveDataReady && (initialLoading || fetchInFlight)) return "empty";
    if (userId && liveDataReady) {
      if (staleError) return "empty";
      return !demoHidden ? "demo" : "empty";
    }
    if (!demoHidden) return "demo";
    return "empty";
  }, [
    ownedLiveTrades.length,
    demoHidden,
    userId,
    error,
    staleError,
    liveDataReady,
    initialLoading,
    fetchInFlight,
  ]);

  const allTrades = mode === "demo" ? AUGUST_DEMO_TRADES : ownedLiveTrades;

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
    mode === "demo"
      ? DEMO_ACCOUNTS
      : ownedLiveAccounts.length > 0
        ? ownedLiveAccounts
        : liveAccountsReady
          ? [fallbackLiveAccount]
          : [];

  const liveAccountIds = useMemo(
    () => ownedLiveAccounts.map((account) => account.id),
    [ownedLiveAccounts],
  );

  const demoAccountIds = useMemo(() => DEMO_ACCOUNTS.map((account) => account.id), []);

  const liveFilterMode: "live" | "empty" = ownedLiveTrades.length > 0 ? "live" : "empty";

  const liveEffectiveFilters = useMemo(
    () =>
      sanitizeLiveFilters(filters, liveAccountIds, liveFilterMode, {
        validateAccountIds: liveAccountsReady,
      }),
    [filters, liveAccountIds, liveFilterMode, liveAccountsReady],
  );

  const demoEffectiveFilters = useMemo(
    () =>
      sanitizeLiveFilters(demoDisplayFilters, demoAccountIds, "demo", {
        validateAccountIds: true,
      }),
    [demoDisplayFilters, demoAccountIds],
  );

  const displayFilters = mode === "demo" ? demoEffectiveFilters : liveEffectiveFilters;

  useEffect(() => {
    if (!userId || filtersUserId !== userId) return;
    if (
      liveEffectiveFilters.accountId === filters.accountId &&
      liveEffectiveFilters.range === filters.range &&
      liveEffectiveFilters.asset === filters.asset
    ) {
      return;
    }
    setFilters(liveEffectiveFilters);
    if (liveAccountsReady || liveEffectiveFilters.range !== filters.range) {
      writeUserJson(FILTERS_KEY, userId, liveEffectiveFilters);
    }
  }, [liveEffectiveFilters, filters, userId, filtersUserId, liveAccountsReady]);

  const persistLiveFilters = (next: FilterPrefs) => {
    if (!userId || filtersUserId !== userId) return;
    const sanitized = sanitizeLiveFilters(next, liveAccountIds, liveFilterMode, {
      validateAccountIds: liveAccountsReady,
    });
    setFilters(sanitized);
    writeUserJson(FILTERS_KEY, userId, sanitized);
  };

  const persistDemoDisplayFilters = (next: FilterPrefs) => {
    setDemoDisplayFilters(
      sanitizeLiveFilters(next, demoAccountIds, "demo", { validateAccountIds: true }),
    );
  };

  const activeRange =
    mode === "demo"
      ? displayFilters.range === "augustDemo"
        ? "augustDemo"
        : displayFilters.range
      : displayFilters.range === "augustDemo"
        ? DEFAULT_LIVE_FILTERS.range
        : displayFilters.range;

  const { from, to } = rangeBounds(activeRange);

  const trades = useMemo(() => {
    return allTrades.filter((trade) => {
      if (displayFilters.accountId !== "all" && trade.accountId !== displayFilters.accountId) {
        return false;
      }
      if (displayFilters.asset !== "all" && trade.assetClass !== displayFilters.asset) {
        return false;
      }
      return inRange(sessionOf(trade), from, to);
    });
  }, [allTrades, displayFilters.accountId, displayFilters.asset, from, to]);

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

  const beginningBalance = resolveBeginningBalanceForScope(accounts, displayFilters.accountId);
  const reported = resolveReportedBalanceForScope(accounts, displayFilters.accountId);
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
    persistLiveFilters({ ...liveEffectiveFilters, range: "all", accountId: "all" });
    await loadLive();
  };

  const value: JournalWorkspaceValue = {
    mode,
    loading: initialLoading,
    loadState,
    refreshing,
    error,
    staleError,
    allTrades,
    trades,
    calculations,
    metrics,
    daily,
    selectedAccountId: displayFilters.accountId,
    range: activeRange,
    asset: displayFilters.asset,
    setAccountId: (accountId) => {
      if (mode === "demo") {
        persistDemoDisplayFilters({ ...demoEffectiveFilters, accountId });
        return;
      }
      persistLiveFilters({ ...liveEffectiveFilters, accountId });
    },
    setRange: (range) => {
      if (mode === "demo") {
        persistDemoDisplayFilters({ ...demoEffectiveFilters, range });
        return;
      }
      persistLiveFilters({ ...liveEffectiveFilters, range });
    },
    setAsset: (asset) => {
      if (mode === "demo") {
        persistDemoDisplayFilters({ ...demoEffectiveFilters, asset });
        return;
      }
      persistLiveFilters({ ...liveEffectiveFilters, asset });
    },
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
