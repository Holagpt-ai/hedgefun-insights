import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useJournalLang, useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

export function DemoBanner() {
  const t = useJournalT();
  const lang = useJournalLang();
  const { mode, hideDemo, demoLabel } = useJournalWorkspace();
  if (mode !== "demo") return null;
  return (
    <div className="journal-demo-banner flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <p className="font-medium">{demoLabel[lang]}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={`${JOURNAL_BASE}/settings?section=imports`}>{t("banner.uploadCsv")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`${JOURNAL_BASE}/trades/new`}>{t("banner.addFirstTrade")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`${JOURNAL_BASE}/trades/new`}>{t("banner.createPlan")}</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={hideDemo}>{t("banner.hideDemo")}</Button>
        <Button size="sm" variant="ghost" disabled>{t("banner.brokerSoon")}</Button>
      </div>
    </div>
  );
}
