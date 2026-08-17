import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateTrade, microsToNumber } from "../calc";
import { HonestState } from "../components/HonestState";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { StatusBadge } from "../components/StatusBadge";
import { useJournalLang, useJournalT } from "../i18n";
import { formatR, signedMoney } from "../lib/format";
import { canCloseTrade } from "../lib/trade-actions";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import type { Outcome, TradeStatus } from "../calc/types";

export function TradesPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const { trades, metrics, loading } = useJournalWorkspace();
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState<"all" | TradeStatus>("all");
  const [outcome, setOutcome] = useState<"all" | Outcome>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    return trades
      .map((trade) => ({ trade, calc: calculateTrade(trade) }))
      .filter(({ trade, calc }) => {
        if (symbol && !trade.symbol.includes(symbol.toUpperCase())) return false;
        if (status !== "all" && calc.status !== status) return false;
        if (outcome !== "all" && calc.outcome !== outcome) return false;
        return true;
      });
  }, [trades, symbol, status, outcome]);

  if (loading) return <HonestState kind="loading" />;
  if (trades.length === 0) return <HonestState kind="empty" title={t("state.noTrades")} />;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t("trades.title")}</h1>
      <div className="journal-filter-bar">
        <Input className="h-[34px] w-36" placeholder={t("trades.symbol")} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-[34px] w-36"><SelectValue placeholder={t("trades.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("trades.all")}</SelectItem>
            <SelectItem value="open">{t("status.open")}</SelectItem>
            <SelectItem value="partially_closed">{t("status.partially_closed")}</SelectItem>
            <SelectItem value="closed">{t("status.closed")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
          <SelectTrigger className="h-[34px] w-36"><SelectValue placeholder={t("trades.outcome")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("trades.all")}</SelectItem>
            <SelectItem value="win">{t("outcome.win")}</SelectItem>
            <SelectItem value="loss">{t("outcome.loss")}</SelectItem>
            <SelectItem value="open">{t("outcome.open")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-xs text-muted-foreground">
        {t("trades.derivedTotals")}: {signedMoney(metrics.netPnl, lang)} · {t("trades.openExposure")}
      </div>
      <JournalTable headers={[t("trades.date"), t("trades.symbol"), t("trades.side"), t("trades.status"), t("trades.qty"), t("trades.remaining"), t("trades.net"), t("trades.r"), t("trades.actions")]}>
        {rows.map(({ trade, calc }) => (
          <Fragment key={trade.id}>
            <TableRow key={trade.id} className="cursor-pointer" onClick={() => setExpanded(expanded === trade.id ? null : trade.id)}>
              <TableCell className="tabular-nums">{trade.sessionDate}</TableCell>
              <TableCell className="font-semibold">{trade.symbol}</TableCell>
              <TableCell>{trade.direction === "long" ? t("trades.long") : t("trades.short")}</TableCell>
              <TableCell><StatusBadge status={calc.status} outcome={calc.outcome} /></TableCell>
              <TableCell className="tabular-nums">{microsToNumber(calc.openQuantity).toFixed(0)}</TableCell>
              <TableCell className="tabular-nums">{microsToNumber(calc.remainingQuantity).toFixed(0)}</TableCell>
              <TableCell className={`tabular-nums ${calc.netRealizedPnl >= 0n ? "journal-gain" : "journal-loss"}`}>{signedMoney(calc.netRealizedPnl, lang)}</TableCell>
              <TableCell className="tabular-nums">{formatR(calc.rMultiple)}</TableCell>
              <TableCell className="space-x-1">
                <Button asChild size="sm" variant="ghost"><Link to={`${JOURNAL_BASE}/trades/${trade.id}`}>{t("trades.open")}</Link></Button>
                <Button asChild size="sm" variant="ghost"><Link to={`${JOURNAL_BASE}/trades/${trade.id}`}>{t("trades.addExecution")}</Link></Button>
                {canCloseTrade(calc.status) ? (
                  <Button asChild size="sm" variant="ghost"><Link to={`${JOURNAL_BASE}/trades/${trade.id}`}>{t("trades.close")}</Link></Button>
                ) : null}
                <Button asChild size="sm" variant="ghost"><Link to={`${JOURNAL_BASE}/daily-review/${trade.sessionDate}`}>{t("trades.review")}</Link></Button>
              </TableCell>
            </TableRow>
            {expanded === trade.id ? (
              <TableRow key={`${trade.id}-ex`}>
                <TableCell colSpan={9} className="bg-muted/40 text-xs">
                  {trade.executions.map((ex) => (
                    <div key={ex.id} className="flex gap-4 py-0.5 tabular-nums">
                      <span>{ex.timestampUtc}</span>
                      <span>{ex.action}</span>
                      <span>{String(ex.quantity)} @ {String(ex.price)}</span>
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </JournalTable>
    </div>
  );
}
