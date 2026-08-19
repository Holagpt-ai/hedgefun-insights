import { calculateTrade, validateSymbol } from "../calc";
import type { Direction, ExecutionInput, TradeInput } from "../calc/types";

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

export type CsvRowStatus = "pending" | "invalid" | "duplicate";

export interface ParsedCsvRow {
  line: number;
  raw: Record<string, string>;
  trade: TradeInput | null;
  errors: string[];
  externalId: string | null;
  duplicate: boolean;
  fingerprint: string;
  status: CsvRowStatus;
}

export interface ParsedCsv {
  format: "generic";
  headers: string[];
  map: CsvColumnMap;
  rows: ParsedCsvRow[];
  validTrades: TradeInput[];
  duplicateIds: string[];
}

export const IMPORT_SOURCE_CSV = "csv";

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

export function normalizeImportPart(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return value.trim().toLowerCase();
}

export function csvRowFingerprint(parts: {
  symbol?: string | null;
  direction?: string | null;
  qty?: number | string | null;
  entryPrice?: number | string | null;
  exitPrice?: number | string | null;
  entryDate?: string | null;
  exitDate?: string | null;
  fees?: number | string | null;
}): string {
  return [
    normalizeImportPart(parts.symbol),
    normalizeImportPart(parts.direction),
    normalizeImportPart(parts.qty),
    normalizeImportPart(parts.entryPrice),
    normalizeImportPart(parts.exitPrice),
    normalizeImportPart(parts.entryDate),
    normalizeImportPart(parts.exitDate),
    normalizeImportPart(parts.fees),
  ].join("|");
}

export function importIdentityKey(
  userId: string,
  source: string,
  externalId: string | null | undefined,
  fingerprint: string,
): string {
  const uid = normalizeImportPart(userId);
  const src = normalizeImportPart(source) || IMPORT_SOURCE_CSV;
  const ext = externalId?.trim();
  if (ext) return `${uid}|${src}|ext:${ext.toLowerCase()}`;
  return `${uid}|${src}|fp:${fingerprint}`;
}

export function parseCsvText(text: string, existingExternalIds: string[] = []): ParsedCsv {
  const { headers, records } = splitCsv(text);
  const map = detectColumnMap(headers);
  const seenExternal = new Set(existingExternalIds.map((id) => id.toLowerCase()));
  const seenFingerprints = new Set<string>();
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
    const fingerprint = csvRowFingerprint({
      symbol,
      direction,
      qty,
      entryPrice,
      exitPrice,
      entryDate,
      exitDate,
      fees,
    });
    let duplicate = false;
    if (externalId) {
      duplicate = seenExternal.has(externalId.toLowerCase());
      if (duplicate) duplicateIds.push(externalId);
      seenExternal.add(externalId.toLowerCase());
    } else if (errors.length === 0) {
      duplicate = seenFingerprints.has(fingerprint);
      seenFingerprints.add(fingerprint);
    }
    if (errors.length > 0) {
      return {
        line: index + 2,
        raw,
        trade: null,
        errors,
        externalId,
        duplicate,
        fingerprint,
        status: "invalid",
      };
    }
    if (duplicate) {
      return {
        line: index + 2,
        raw,
        trade: null,
        errors,
        externalId,
        duplicate: true,
        fingerprint,
        status: "duplicate",
      };
    }
    const id = cryptoRandom();
    const executions: ExecutionInput[] = [
      fill(`${id}-in`, `${entryDate}T14:00:00Z`, direction === "long" ? "buy" : "short", qty, entryPrice, fees / (exitPrice != null ? 2 : 1), {
        externalExecutionId: externalId ?? undefined,
      }),
    ];
    if (exitPrice != null && exitDate) {
      executions.push(
        fill(`${id}-out`, `${exitDate}T18:00:00Z`, direction === "long" ? "sell" : "cover", qty, exitPrice, fees / 2, {
          externalExecutionId: externalId ?? undefined,
        }),
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
      externalId,
    };
    return {
      line: index + 2,
      raw,
      trade,
      errors,
      externalId,
      duplicate: false,
      fingerprint,
      status: "pending",
    };
  });

  return {
    format: "generic",
    headers,
    map,
    rows,
    validTrades: rows.filter((row) => row.trade && row.status === "pending").map((row) => row.trade as TradeInput),
    duplicateIds,
  };
}

export function previewCsvNets(parsed: ParsedCsv) {
  return parsed.validTrades.map((trade) => {
    const calc = calculateTrade(trade);
    return { id: trade.id, symbol: trade.symbol, net: calc.netRealizedPnl, status: calc.status };
  });
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
  extra?: Partial<ExecutionInput>,
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
    ...extra,
  };
}

function cryptoRandom(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}
