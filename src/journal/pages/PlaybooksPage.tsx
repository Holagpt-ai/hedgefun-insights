import { Link } from "react-router-dom";
import { aggregateTrades } from "../calc";
import { HonestState } from "../components/HonestState";
import { useJournalLang, useJournalT } from "../i18n";
import { signedMoney } from "../lib/format";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function PlaybooksPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const { trades } = useJournalWorkspace();
  const groups = new Map<string, typeof trades>();
  for (const trade of trades) {
    const name = trade.playbookName || trade.playbookId || "—";
    const list = groups.get(name) ?? [];
    list.push(trade);
    groups.set(name, list);
  }
  const rows = [...groups.entries()].map(([name, list]) => ({
    id: list[0]?.playbookId || name,
    name,
    metrics: aggregateTrades(list),
    count: list.length,
    planned: list.filter((tr) => tr.planned !== false).length,
  }));

  if (rows.length === 0) return <HonestState kind="empty" title={t("playbooks.empty")} />;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t("playbooks.title")}</h1>
      <div className="grid md:grid-cols-2 gap-2">
        {rows.map((row) => (
          <Link key={row.id} to={`${JOURNAL_BASE}/playbooks/${encodeURIComponent(row.id)}`} className="journal-card p-3 block">
            <div className="font-semibold">{row.name}</div>
            <div className="text-xs text-muted-foreground">{t("playbooks.trades", { n: row.count })} · {t("playbooks.adherence")} {Math.round((row.planned / row.count) * 100)}%</div>
            <div className={`text-sm font-bold tabular-nums mt-1 ${row.metrics.netPnl >= 0n ? "journal-gain" : "journal-loss"}`}>{signedMoney(row.metrics.netPnl, lang)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
