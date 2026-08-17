import { aggregateTrades, microsToNumber, realizedDrawdown, sequenceMetrics } from "../calc";
import { KpiCard } from "../components/KpiCard";
import { useJournalLang, useJournalT } from "../i18n";
import { pct, signedMoney } from "../lib/format";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function AnalyticsPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const { trades, daily, metrics } = useJournalWorkspace();
  const { maxDrawdown, recoveryFactor } = realizedDrawdown(daily);
  const longs = aggregateTrades(trades.filter((tr) => tr.direction === "long"));
  const shorts = aggregateTrades(trades.filter((tr) => tr.direction === "short"));
  const seq = sequenceMetrics(trades);
  const afterWin = seq.filter((s) => s.priorResult === "win").length;
  const afterLoss = seq.filter((s) => s.priorResult === "loss").length;
  const playbooks = new Map<string, number>();
  for (const trade of trades) {
    const name = trade.playbookName || "—";
    playbooks.set(name, (playbooks.get(name) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t("analytics.title")}</h1>
      <div className="grid md:grid-cols-3 gap-2">
        <KpiCard label={t("analytics.drawdown")} value={signedMoney(-maxDrawdown, lang)} definition={t("def.netPnl")} sampleSize={daily.length} />
        <KpiCard label={t("kpi.profitFactor")} value={recoveryFactor != null ? recoveryFactor.toFixed(2) : "—"} definition={t("def.profitFactor")} sampleSize={metrics.sampleSize} />
        <KpiCard label={t("analytics.sequence")} value={`${afterWin} / ${afterLoss}`} definition={t("def.averageR")} />
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("analytics.bySide")}</div>
          <p className="text-sm mt-2">{t("trades.long")} {signedMoney(longs.netPnl, lang)} · {pct(longs.winRate)}</p>
          <p className="text-sm">{t("trades.short")} {signedMoney(shorts.netPnl, lang)} · {pct(shorts.winRate)}</p>
        </div>
        <div className="journal-card p-3">
          <div className="journal-card-hd">{t("analytics.byPlaybook")}</div>
          <ul className="text-xs mt-2 space-y-1">
            {[...playbooks.entries()].map(([name, count]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span className="tabular-nums">{count}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("kpi.sample")} {metrics.sampleSize} · {microsToNumber(metrics.netPnl).toFixed(2)}</p>
    </div>
  );
}
