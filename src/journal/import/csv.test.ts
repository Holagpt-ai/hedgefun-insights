import { describe, expect, it } from "vitest";
import { aggregateTrades, microsToNumber } from "../calc";
import { parseCsvText, previewCsvNets } from "./csv";

const SAMPLE = `symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv
AAPL,long,100,215.8,217.08,2026-08-14,2026-08-14,8,aapl-csv
`;

describe("csv import", () => {
  it("parses NVDA/AAPL CSV and computes net via the engine", () => {
    const parsed = parseCsvText(SAMPLE);
    expect(parsed.format).toBe("generic");
    expect(parsed.validTrades.map((t) => t.symbol)).toEqual(["NVDA", "AAPL"]);
    const preview = previewCsvNets(parsed);
    const nvda = preview.find((row) => row.symbol === "NVDA");
    const aapl = preview.find((row) => row.symbol === "AAPL");
    expect(nvda).toBeTruthy();
    expect(aapl).toBeTruthy();
    expect(Number(microsToNumber(nvda!.net).toFixed(2))).toBe(440);
    expect(Number(microsToNumber(aapl!.net).toFixed(2))).toBe(120);
    const metrics = aggregateTrades(parsed.validTrades);
    expect(Number(microsToNumber(metrics.netPnl).toFixed(2))).toBe(560);
    expect(metrics.wins).toBe(2);
  });

  it("maps Spanish headers", () => {
    const parsed = parseCsvText(`símbolo,lado,cantidad,precio de entrada,precio de salida,fecha,comisiones
MSFT,largo,10,400,410,2026-08-14,2
`);
    expect(parsed.validTrades).toHaveLength(1);
    expect(parsed.validTrades[0].symbol).toBe("MSFT");
  });

  it("keeps broker external IDs on parsed executions", () => {
    const parsed = parseCsvText(SAMPLE);
    const nvda = parsed.rows.find((row) => row.externalId === "nvda-csv");
    expect(nvda?.trade?.externalId).toBe("nvda-csv");
    expect(nvda?.trade?.executions.every((execution) => execution.externalExecutionId === "nvda-csv")).toBe(true);
  });

  it("marks in-file duplicate external IDs without treating them as valid trades", () => {
    const parsed = parseCsvText(`${SAMPLE}NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv\n`);
    expect(parsed.validTrades.map((trade) => trade.symbol)).toEqual(["NVDA", "AAPL"]);
    expect(parsed.duplicateIds).toEqual(["nvda-csv"]);
    expect(parsed.rows.filter((row) => row.status === "duplicate")).toHaveLength(1);
  });
});
