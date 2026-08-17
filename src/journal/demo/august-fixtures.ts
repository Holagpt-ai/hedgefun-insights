import type { ExecutionInput, TradeInput } from "../calc/types";

const TZ = "America/New_York";

function fill(
  id: string,
  timestampUtc: string,
  action: ExecutionInput["action"],
  quantity: number,
  price: number,
  fees: { commission?: number; regulatoryFee?: number; otherFee?: number },
  extra?: Partial<ExecutionInput>,
): ExecutionInput {
  return {
    id,
    timestamp: timestampUtc,
    timestampUtc,
    originalTimezone: TZ,
    action,
    quantity,
    price,
    commission: fees.commission ?? 0,
    regulatoryFee: fees.regulatoryFee ?? 0,
    otherFee: fees.otherFee ?? 0,
    feeCurrency: "USD",
    ...extra,
  };
}

function stockTrade(
  id: string,
  symbol: string,
  direction: "long" | "short",
  sessionDate: string,
  executions: ExecutionInput[],
  extras: Partial<TradeInput> = {},
): TradeInput {
  return {
    id,
    accountId: "demo-account-main",
    assetClass: "stock",
    instrument: "share",
    symbol,
    direction,
    status: extras.status ?? "closed",
    executions,
    sessionDate,
    planned: extras.planned ?? true,
    reviewed: extras.reviewed ?? true,
    playbookName: extras.playbookName,
    playbookId: extras.playbookId,
    plannedRisk: extras.plannedRisk,
    plannedStop: extras.plannedStop,
    plannedTarget: extras.plannedTarget,
    plannedEntry: extras.plannedEntry,
    plannedSize: extras.plannedSize,
    thesis: extras.thesis,
    ruleDeviation: extras.ruleDeviation,
    tags: extras.tags,
  };
}

/** Canonical Friday Aug 14, 2026 session — authoritative demo ledger. */
export const AUGUST_14_TRADES: TradeInput[] = [
  stockTrade(
    "demo-nvda",
    "NVDA",
    "long",
    "2026-08-14",
    [
      fill("nvda-in", "2026-08-14T13:32:00Z", "buy", 100, 118.4, { commission: 4 }),
      fill("nvda-out-1", "2026-08-14T15:10:00Z", "sell", 50, 121.2, { commission: 2 }),
      fill("nvda-out-2", "2026-08-14T17:40:00Z", "sell", 50, 124.56, { commission: 2 }),
    ],
    {
      playbookId: "pb-momentum",
      playbookName: "Momentum Breakout",
      plannedRisk: "209.52380952",
      plannedStop: 116.3,
      plannedTarget: 124.5,
      plannedEntry: 118.4,
      plannedSize: 100,
      thesis: "Opening drive continuation after relative-volume spike.",
    },
  ),
  {
    id: "demo-spy-450c",
    accountId: "demo-account-main",
    assetClass: "equity_option",
    instrument: "option",
    symbol: "SPY",
    direction: "long",
    status: "closed_before_expiration",
    sessionDate: "2026-08-14",
    planned: true,
    reviewed: true,
    playbookId: "pb-orb",
    playbookName: "Opening Range Breakout",
    plannedRisk: "209.67741935",
    plannedStop: 2.4,
    plannedTarget: 4.5,
    plannedEntry: 3.2,
    plannedSize: 5,
    thesis: "ORB on SPY with defined debit risk.",
    legs: [
      {
        id: "spy-leg-1",
        action: "buy",
        right: "call",
        strike: 450,
        expiration: "2026-08-14",
        contracts: 5,
        multiplier: 100,
        occSymbol: "SPY260814C00450000",
        status: "closed_before_expiration",
      },
    ],
    executions: [
      fill("spy-in", "2026-08-14T13:45:00Z", "buy", 5, 3.2, { commission: 5 }, { multiplier: 100, legId: "spy-leg-1" }),
      fill("spy-out", "2026-08-14T16:05:00Z", "sell", 5, 4.52, { commission: 5 }, { multiplier: 100, legId: "spy-leg-1" }),
    ],
  },
  stockTrade(
    "demo-aapl",
    "AAPL",
    "long",
    "2026-08-14",
    [
      fill("aapl-in", "2026-08-14T14:12:00Z", "buy", 100, 215.8, { commission: 4 }),
      fill("aapl-out", "2026-08-14T18:01:00Z", "sell", 100, 217.08, { commission: 4 }),
    ],
    {
      playbookId: "pb-vwap",
      playbookName: "VWAP Reclaim",
      plannedRisk: "92.30769231",
      plannedStop: 214.6,
      plannedTarget: 217.2,
      plannedEntry: 215.8,
      plannedSize: 100,
    },
  ),
  stockTrade(
    "demo-tsla",
    "TSLA",
    "long",
    "2026-08-14",
    [
      fill("tsla-in", "2026-08-14T14:40:00Z", "buy", 100, 248.2, { commission: 3 }),
      fill("tsla-out", "2026-08-14T15:55:00Z", "sell", 100, 248.66, { commission: 3 }),
    ],
    {
      playbookId: "pb-momentum",
      playbookName: "Momentum Breakout",
      plannedRisk: "133.33333333",
      plannedStop: 246.8,
      plannedTarget: 252,
      plannedEntry: 248.2,
      plannedSize: 100,
    },
  ),
  stockTrade(
    "demo-pltr",
    "PLTR",
    "short",
    "2026-08-14",
    [
      fill("pltr-in", "2026-08-14T19:10:00Z", "short", 100, 38.9, { commission: 3 }),
      fill("pltr-out", "2026-08-14T19:48:00Z", "cover", 100, 40.14, { commission: 3 }),
    ],
    {
      planned: false,
      ruleDeviation: true,
      playbookName: "Unplanned",
      plannedRisk: "216.66666667",
      tags: ["unplanned", "rule-deviation"],
      thesis: "Impulse short after a green streak. Not in plan.",
    },
  ),
];

const OTHER_DAYS: Array<{
  date: string;
  symbol: string;
  netHint: number;
  fees: number;
  qty: number;
  entry: number;
  reviewed: boolean;
}> = [
  { date: "2026-08-03", symbol: "MSFT", netHint: 420, fees: 18, qty: 50, entry: 420, reviewed: true },
  { date: "2026-08-04", symbol: "AMZN", netHint: 850, fees: 20, qty: 40, entry: 180, reviewed: true },
  { date: "2026-08-05", symbol: "META", netHint: -390, fees: 16, qty: 20, entry: 510, reviewed: true },
  { date: "2026-08-06", symbol: "AMD", netHint: 1050, fees: 22, qty: 80, entry: 140, reviewed: true },
  { date: "2026-08-07", symbol: "INTC", netHint: 620, fees: 18, qty: 100, entry: 32, reviewed: false },
  { date: "2026-08-10", symbol: "NFLX", netHint: -780, fees: 16, qty: 16, entry: 680, reviewed: true },
  { date: "2026-08-11", symbol: "AVGO", netHint: 530, fees: 18, qty: 10, entry: 170, reviewed: true },
  { date: "2026-08-12", symbol: "CRM", netHint: -210, fees: 16, qty: 25, entry: 255, reviewed: false },
  { date: "2026-08-13", symbol: "COST", netHint: 940, fees: 18, qty: 10, entry: 890, reviewed: true },
];

function tradeForDay(row: (typeof OTHER_DAYS)[number]): TradeInput {
  const gross = row.netHint + row.fees;
  const exit = (row.entry * row.qty + gross) / row.qty;
  const exitExact = Math.round(exit * 100) / 100;
  const halfFee = row.fees / 2;
  return stockTrade(
    `demo-${row.date}-${row.symbol}`,
    row.symbol,
    "long",
    row.date,
    [
      fill(`${row.symbol}-in`, `${row.date}T14:00:00Z`, "buy", row.qty, row.entry, { commission: halfFee }),
      fill(`${row.symbol}-out`, `${row.date}T18:00:00Z`, "sell", row.qty, exitExact, { commission: halfFee }),
    ],
    {
      reviewed: row.reviewed,
      playbookId: "pb-momentum",
      playbookName: "Momentum Breakout",
      plannedRisk: Math.abs(row.netHint) / 2,
      plannedSize: row.qty,
      plannedEntry: row.entry,
    },
  );
}

export const AUGUST_OPEN_TRADES: TradeInput[] = [
  stockTrade(
    "demo-open-nvda",
    "NVDA",
    "long",
    "2026-08-14",
    [fill("open-nvda", "2026-08-14T19:50:00Z", "buy", 40, 124.1, { commission: 2 })],
    { status: "open", reviewed: false, plannedSize: 40, plannedEntry: 124.1, plannedRisk: 180 },
  ),
  {
    id: "demo-open-qqq-380p",
    accountId: "demo-account-options",
    assetClass: "equity_option",
    instrument: "option",
    symbol: "QQQ",
    direction: "long",
    status: "open",
    sessionDate: "2026-08-13",
    planned: true,
    reviewed: false,
    playbookName: "Hedge",
    plannedRisk: 420,
    legs: [
      {
        id: "qqq-leg",
        action: "buy",
        right: "put",
        strike: 380,
        expiration: "2026-08-21",
        contracts: 2,
        multiplier: 100,
        occSymbol: "QQQ260821P00380000",
        status: "open",
      },
    ],
    executions: [
      fill("qqq-in", "2026-08-13T15:20:00Z", "buy", 2, 2.15, { commission: 4 }, { multiplier: 100, legId: "qqq-leg" }),
    ],
  },
  stockTrade(
    "demo-open-amd",
    "AMD",
    "long",
    "2026-08-13",
    [
      fill("amd-in", "2026-08-13T14:10:00Z", "buy", 120, 141.2, { commission: 4 }),
      fill("amd-out", "2026-08-13T17:20:00Z", "sell", 50, 144.8, { commission: 2 }),
    ],
    {
      status: "partially_closed",
      reviewed: false,
      playbookName: "Momentum Breakout",
      plannedRisk: 260,
      plannedSize: 120,
      plannedEntry: 141.2,
    },
  ),
];

export const AUGUST_CLOSED_TRADES: TradeInput[] = [
  ...OTHER_DAYS.map(tradeForDay),
  ...AUGUST_14_TRADES,
];

export const AUGUST_DEMO_TRADES: TradeInput[] = [
  ...AUGUST_CLOSED_TRADES,
  ...AUGUST_OPEN_TRADES,
];

export const DEMO_ACCOUNTS = [
  {
    id: "demo-account-main",
    name: "Primary Equities",
    type: "personal",
    baseCurrency: "USD",
    beginningBalance: 50000,
    reportedBalance: 54150,
    reportedAsOf: "2026-08-14T20:00:00Z",
  },
  {
    id: "demo-account-options",
    name: "Options Sleeve",
    type: "personal",
    baseCurrency: "USD",
    beginningBalance: 15000,
    reportedBalance: 15000,
    reportedAsOf: "2026-08-14T20:00:00Z",
  },
  {
    id: "demo-account-crypto",
    name: "Crypto Spot",
    type: "personal",
    baseCurrency: "USD",
    beginningBalance: 8000,
    reportedBalance: 8000,
    reportedAsOf: "2026-08-14T20:00:00Z",
  },
] as const;

export const DEMO_MISSING_REVIEWS = new Set(["2026-08-07", "2026-08-12"]);

export const DEMO_WORKSPACE_LABEL = {
  en: "DEMO WORKSPACE — Illustrative data only. Upload a CSV or add your first trade to see your actual performance.",
  es: "ESPACIO DE DEMOSTRACIÓN — Solo datos ilustrativos. Sube un CSV o agrega tu primera operación para ver tu rendimiento real.",
} as const;
