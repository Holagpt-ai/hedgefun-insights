import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { microsToNumber } from "../calc";
import { HonestState } from "../components/HonestState";
import { JournalTable, TableCell, TableRow } from "../components/JournalTable";
import { useJournalT } from "../i18n";
import { parseCsvText, previewCsvNets, confirmImport, loadImportJobs, rollbackImportJob, type ParsedCsv } from "../import/csv";
import { saveTrade } from "../ledger/saveTrade";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function ImportWizard() {
  const t = useJournalT();
  const { user } = useAuth();
  const { mode, onLiveTradeSaved, hideDemo } = useJournalWorkspace();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setParsed(parseCsvText(text));
    setMessage(null);
  };

  const confirm = async () => {
    if (!parsed || !user) return;
    const job = confirmImport(parsed, loadImportJobs());
    for (const trade of parsed.validTrades) {
      await saveTrade(
        {
          ...trade,
          id: trade.id.startsWith("demo-") ? `live-${crypto.randomUUID()}` : trade.id,
          accountId: trade.accountId.startsWith("demo-") ? "live-default" : trade.accountId,
        },
        { mode: "live", userId: user.id, client: supabase as never },
      );
    }
    hideDemo();
    await onLiveTradeSaved();
    setMessage(t("import.done", { n: parsed.validTrades.length }));
    void job;
  };

  const rollback = () => {
    const jobs = loadImportJobs();
    const last = jobs.at(-1);
    if (!last) return;
    rollbackImportJob(last.id, []);
    setMessage(t("import.rolled"));
  };

  return (
    <div className="journal-card p-3 space-y-3">
      <h2 className="font-semibold">{t("import.title")}</h2>
      {mode === "demo" ? <HonestState kind="demo" body={t("import.demoBlock")} /> : null}
      <label className="text-xs block border border-dashed rounded-md p-4 cursor-pointer">
        {t("import.drop")}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }} />
      </label>
      {parsed ? (
        <>
          <p className="text-xs">{t("import.detected", { format: parsed.format })} · {t("import.rows", { n: parsed.validTrades.length })} · {t("import.invalid", { n: parsed.rows.filter((r) => r.errors.length).length })} · {t("import.dupes", { n: parsed.duplicateIds.length })}</p>
          <JournalTable headers={[t("trades.symbol"), t("trades.net"), t("import.validation")]}>
            {previewCsvNets(parsed).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.symbol}</TableCell>
                <TableCell className="tabular-nums">{microsToNumber(row.net).toFixed(2)}</TableCell>
                <TableCell>{row.status}</TableCell>
              </TableRow>
            ))}
          </JournalTable>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void confirm()}>{t("import.confirm")}</Button>
            <Button size="sm" variant="outline" onClick={() => setParsed(null)}>{t("import.cancel")}</Button>
            <Button size="sm" variant="ghost" onClick={rollback}>{t("import.rollback")}</Button>
          </div>
        </>
      ) : null}
      {message ? <p className="text-xs">{message}</p> : null}
    </div>
  );
}
