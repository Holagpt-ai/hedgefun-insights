import { useParams } from "react-router-dom";
import { aggregateTrades, calculateTrade } from "../calc";
import { HonestState } from "../components/HonestState";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { StatusBadge } from "../components/StatusBadge";
import { useJournalLang, useJournalT } from "../i18n";
import { signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function PlaybookDetailPage() {
  const { playbookId } = useParams();
  const t = useJournalT();
  const lang = useJournalLang();
  const { trades } = useJournalWorkspace();
  const decoded = decodeURIComponent(playbookId ?? "");
  const list = trades.filter((trade) => (trade.playbookId || trade.playbookName || "—") === decoded || trade.playbookName === decoded);
  if (list.length === 0) return <HonestState kind="empty" title={t("playbooks.notFound")} />;
  const metrics = aggregateTrades(list);
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{list[0].playbookName || decoded}</h1>
      <p className="text-sm tabular-nums">{signedMoney(metrics.netPnl, lang)} · {t("playbooks.trades", { n: list.length })}</p>
      <div className="journal-card p-3 text-xs">
        <div className="journal-card-hd">{t("playbooks.rules")}</div>
        <p className="mt-1">{t("playbooks.versions")} v1</p>
      </div>
      <JournalTable headers={[t("trades.symbol"), t("trades.net"), t("trades.status")]}>
        {list.map((trade) => {
          const calc = calculateTrade(trade);
          return (
            <TableRow key={trade.id}>
              <TableCell><a className="text-accent-blue font-semibold" href={`${JOURNAL_BASE}/trades/${trade.id}`}>{trade.symbol}</a></TableCell>
              <TableCell className="tabular-nums">{signedMoney(calc.netRealizedPnl, lang)}</TableCell>
              <TableCell><StatusBadge outcome={calc.outcome} /></TableCell>
            </TableRow>
          );
        })}
      </JournalTable>
    </div>
  );
}
