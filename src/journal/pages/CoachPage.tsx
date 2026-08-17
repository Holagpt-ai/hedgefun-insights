import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { aggregateTrades, calculateTrade } from "../calc";
import { EvidenceCard } from "../components/EvidenceCard";
import { useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function CoachPage() {
  const t = useJournalT();
  const { trades, metrics, mode } = useJournalWorkspace();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(false);
  const calcs = useMemo(() => trades.map(calculateTrade), [trades]);
  const leak = calcs.filter((c) => c.outcome === "loss").sort((a, b) => Number(a.netRealizedPnl - b.netRealizedPnl))[0];
  const strength = calcs.filter((c) => c.outcome === "win").sort((a, b) => Number(b.netRealizedPnl - a.netRealizedPnl))[0];
  const unplanned = trades.filter((tr) => tr.planned === false || tr.ruleDeviation);
  const unplannedNet = aggregateTrades(unplanned).netPnl;

  return (
    <div className="space-y-3 max-w-3xl">
      <h1 className="text-lg font-bold">{t("coach.title")}</h1>
      <p className="text-xs text-muted-foreground">{t("coach.subtitle")}</p>
      <EvidenceCard
        demo={mode === "demo"}
        tone="gain"
        title={t("coach.evidence")}
        body={strength
          ? `${strength.symbol} ${t("outcome.win")} · sample ${metrics.sampleSize} · net from engine.`
          : t("coach.empty")}
        links={strength ? [{ label: strength.symbol, href: `${JOURNAL_BASE}/trades/${strength.tradeId}` }] : undefined}
      />
      <EvidenceCard
        demo={mode === "demo"}
        tone="loss"
        title={t("coach.counter")}
        body={leak
          ? `${leak.symbol} ${t("outcome.loss")}. Unplanned net ${String(unplannedNet)}. Do not treat P&L as process.`
          : t("coach.empty")}
        links={leak ? [{ label: leak.symbol, href: `${JOURNAL_BASE}/trades/${leak.tradeId}` }] : undefined}
      />
      <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("coach.ask")} />
      <Button size="sm" onClick={() => setAsked(true)}>{t("coach.submit")}</Button>
      {asked ? (
        <EvidenceCard
          demo={mode === "demo"}
          tone="brand"
          title={t("coach.title")}
          body={mode === "demo"
            ? t("detail.demoAi")
            : `${t("kpi.netPnl")} sample ${metrics.sampleSize}. ${question}`.trim()}
        />
      ) : null}
    </div>
  );
}
