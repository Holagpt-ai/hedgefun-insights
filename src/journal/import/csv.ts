import { calculateTrade, validateSymbol } from "../calc";
import type { Direction, ExecutionInput, TradeInput } from "../calc/types";
import { isDemoTradeId, readJson, writeJson, IMPORT_JOBS_KEY } from "../lib/storage";

export interface CsvColumnMap {
  symbol: string;
  side?: string;
  qty: string;
  entryPrice: string;
  exitPrice?: string;
  entryDate: string;
  exitDate?: string;
  fees?: string;
  playbook?: string;
  account?: string;
  externalId?: string;
}

export interface ParsedCsvRow {
  line: number;
  raw: Record<string, string>;
  trade: TradeInput | null;
  errors: string[];
  externalId: string | null;
  duplicate: boolean;
}

export interface ParsedCsv {
  format: "generic";
  headers: string[];
  map: CsvColumnMap;
  rows: ParsedCsvRow[];
  validTrades: TradeInput[];
  duplicateIds: string[];
}

export interface ImportJob {
  id: string;
  createdAt: string;
  tradeIds: string[];
  externalIds: string[];
}

const HEADER_ALIASES: Record<keyof CsvColumnMap, string[]> = {
  symbol: ["symbol", "ticker", "simbolo", "símbolo"],
  side: ["side", "direction", "lado", "dirección", "direccion"],
  qty: ["qty", "quantity", "shares", "contracts", "cantidad", "acciones", "contratos"],
  entryPrice: ["entry_price", "entry", "entryprice", "precio de entrada", "precio_entrada", "open"],
  exitPrice: ["exit_price", "exit", "exitprice", "precio de salida", "precio_salida", "close"],
  entryDate: ["entry_date", "date", "fecha", "fecha de entrada", "fecha_entrada", "timestamp"],
  exitDate: ["exit_date", "fecha de salida", "fecha_salida"],
  fees: ["fees", "commission", "comisiones", "comisión", "comision"],
  playbook: ["playbook", "setup", "setup_tag", "estrategia"],
  account: ["account", "cuenta"],
  externalId: ["external_id", "id", "id externo", "id_externo", "trade_id"],
};

export function parseCsvText(text: string, existingExternalIds: string[] = []): ParsedCsv {
  const { headers, records } = splitCsv(text);
  const map = detectColumnMap(headers);
  const seen = new Set(existingExternalIds.map((id) => id.toLowerCase()));
  const duplicateIds: string[] = [];
  const rows: ParsedCsvRow[] = records.map((raw, index) => {
    const errors: string[] = [];
    const symbol = validateSymbol(pick(raw, map.symbol));
    if (!symbol) errors.push("invalid_symbol");
    const qty = Number(pick(raw, map.qty));
    if (!Number.isFinite(qty) || qty <= 0) errors.push("invalid_qty");
    const entryPrice = Number(pick(raw, map.entryPrice));
    if (!Number.isFinite(entryPrice)) errors.push("invalid_entry");
    const exitRaw = map.exitPrice ? pick(raw, map.exitPrice) : "";
    const exitPrice = exitRaw ? Number(exitRaw) : null;
    if (exitRaw && !Number.isFinite(exitPrice)) errors.push("invalid_exit");
    const entryDate = normalizeDate(pick(raw, map.entryDate));
    if (!entryDate) errors.push("invalid_date");
    const exitDate = map.exitDate ? normalizeDate(pick(raw, map.exitDate)) : exitRaw ? entryDate : null;
    const sideRaw = (map.side ? pick(raw, map.side) : "long").toLowerCase();
    const direction: Direction = sideRaw.includes("short") || sideRaw.includes("corto") ? "short" : "long";
    const fees = map.fees ? Number(pick(raw, map.fees) || 0) : 0;
    const externalId = map.externalId ? pick(raw, map.externalId) || null : null;
    const duplicate = Boolean(externalId && seen.has(externalId.toLowerCase()));
    if (externalId) {
      if (duplicate) duplicateIds.push(externalId);
      seen.add(externalId.toLowerCase());
    }
    if (errors.length > 0) {
      return { line: index + 2, raw, trade: null, errors, externalId, duplicate };
    }
    const id = externalId && !duplicate ? `live-${externalId}` : `live-${cryptoRandom()}`;
    const executions: ExecutionInput[] = [
      fill(`${id}-in`, `${entryDate}T14:00:00Z`, direction === "long" ? "buy" : "short", qty, entryPrice, fees / (exitPrice != null ? 2 : 1)),
    ];
    if (exitPrice != null && exitDate) {
      executions.push(
        fill(`${id}-out`, `${exitDate}T18:00:00Z`, direction === "long" ? "sell" : "cover", qty, exitPrice, fees / 2),
      );
    }
    const trade: TradeInput = {
      id,
      accountId: map.account ? pick(raw, map.account) || "live-default" : "live-default",
      assetClass: "stock",
      instrument: "share",
      symbol: symbol!,
      direction,
      status: exitPrice != null ? "closed" : "open",
      executions,
      sessionDate: entryDate,
      playbookName: map.playbook ? pick(raw, map.playbook) || null : null,
      reviewed: false,
    };
    return { line: index + 2, raw, trade, errors, externalId, duplicate };
  });

  return {
    format: "generic",
    headers,
    map,
    rows,
    validTrades: rows.filter((row) => row.trade && !row.duplicate).map((row) => row.trade as TradeInput),
    duplicateIds,
  };
}

export function previewCsvNets(parsed: ParsedCsv) {
  return parsed.validTrades.map((trade) => {
    const calc = calculateTrade(trade);
    return { id: trade.id, symbol: trade.symbol, net: calc.netRealizedPnl, status: calc.status };
  });
}

export function confirmImport(parsed: ParsedCsv, existing: ImportJob[] = []): ImportJob {
  const job: ImportJob = {
    id: `job-${Date.now()}`,
    createdAt: new Date().toISOString(),
    tradeIds: parsed.validTrades.map((trade) => trade.id),
    externalIds: parsed.rows.map((row) => row.externalId).filter((id): id is string => Boolean(id)),
  };
  writeJson(IMPORT_JOBS_KEY, [...existing, job]);
  return job;
}

export function loadImportJobs(): ImportJob[] {
  return readJson<ImportJob[]>(IMPORT_JOBS_KEY, []);
}

export function rollbackImportJob(jobId: string, liveTrades: TradeInput[]): { trades: TradeInput[]; job: ImportJob | null } {
  const jobs = loadImportJobs();
  const job = jobs.find((item) => item.id === jobId) ?? null;
  if (!job) return { trades: liveTrades, job: null };
  const ids = new Set(job.tradeIds);
  writeJson(IMPORT_JOBS_KEY, jobs.filter((item) => item.id !== jobId));
  return { trades: liveTrades.filter((trade) => !ids.has(trade.id) && !isDemoTradeId(trade.id)), job };
}

export function detectColumnMap(headers: string[]): CsvColumnMap {
  const normalized = headers.map(norm);
  const find = (keys: string[]) => {
    const aliases = keys.map(norm);
    const hit = normalized.find((header) => aliases.includes(header));
    return hit ? headers[normalized.indexOf(hit)] : "";
  };
  return {
    symbol: find(HEADER_ALIASES.symbol) || headers[0] || "symbol",
    side: find(HEADER_ALIASES.side) || undefined,
    qty: find(HEADER_ALIASES.qty) || headers[1] || "qty",
    entryPrice: find(HEADER_ALIASES.entryPrice) || "entry_price",
    exitPrice: find(HEADER_ALIASES.exitPrice) || undefined,
    entryDate: find(HEADER_ALIASES.entryDate) || "date",
    exitDate: find(HEADER_ALIASES.exitDate) || undefined,
    fees: find(HEADER_ALIASES.fees) || undefined,
    playbook: find(HEADER_ALIASES.playbook) || undefined,
    account: find(HEADER_ALIASES.account) || undefined,
    externalId: find(HEADER_ALIASES.externalId) || undefined,
  };
}

function splitCsv(text: string): { headers: string[]; records: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], records: [] };
  const headers = parseLine(lines[0]);
  const records = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, records };
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function pick(row: Record<string, string>, header: string): string {
  return row[header] ?? "";
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function fill(
  id: string,
  timestampUtc: string,
  action: ExecutionInput["action"],
  quantity: number,
  price: number,
  commission: number,
): ExecutionInput {
  return {
    id,
    timestamp: timestampUtc,
    timestampUtc,
    originalTimezone: "America/New_York",
    action,
    quantity,
    price,
    commission,
    feeCurrency: "USD",
  };
}

function cryptoRandom(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
