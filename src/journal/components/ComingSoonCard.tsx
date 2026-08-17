import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJournalT } from "../i18n";

export function ComingSoonCard({ kind }: { kind: "broker" | "exchange" }) {
  const t = useJournalT();
  return (
    <div className="journal-card p-4 opacity-80">
      <div className="flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold">{kind === "broker" ? t("coming.broker") : t("coming.exchange")}</div>
        <span className="journal-badge journal-badge-neu">{t("coming.inactive")}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{t("coming.body")}</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" disabled>
        {t("state.comingSoon")}
      </Button>
    </div>
  );
}
