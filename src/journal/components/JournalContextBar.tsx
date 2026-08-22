import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJournalT } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import type { FilterPrefs } from "../lib/storage";

export function JournalContextBar() {
  const t = useJournalT();
  const { accounts, selectedAccountId, setAccountId, range, setRange, asset, setAsset, mode } = useJournalWorkspace();

  return (
    <div className="journal-filter-bar">
      <Select value={selectedAccountId} onValueChange={setAccountId}>
        <SelectTrigger className="journal-filter-btn w-[180px] h-[34px]">
          <SelectValue placeholder={t("bar.account")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("bar.allAccounts")}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={range} onValueChange={(value) => setRange(value as FilterPrefs["range"])}>
        <SelectTrigger className="journal-filter-btn w-[170px] h-[34px]">
          <SelectValue placeholder={t("bar.range")} />
        </SelectTrigger>
        <SelectContent>
          {mode === "demo" ? <SelectItem value="augustDemo">{t("range.augustDemo")}</SelectItem> : null}
          <SelectItem value="week">{t("range.week")}</SelectItem>
          <SelectItem value="mtd">{t("range.mtd")}</SelectItem>
          <SelectItem value="month">{t("range.month")}</SelectItem>
          <SelectItem value="ytd">{t("range.ytd")}</SelectItem>
          <SelectItem value="all">{t("range.all")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={asset} onValueChange={(value) => setAsset(value as FilterPrefs["asset"])}>
        <SelectTrigger className="journal-filter-btn w-[150px] h-[34px]">
          <SelectValue placeholder={t("bar.asset")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("bar.allAssets")}</SelectItem>
          <SelectItem value="stock">{t("bar.stocks")}</SelectItem>
          <SelectItem value="equity_option">{t("bar.options")}</SelectItem>
          <SelectItem value="crypto_spot">{t("bar.crypto")}</SelectItem>
        </SelectContent>
      </Select>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={`${JOURNAL_BASE}/settings?section=imports`}>{t("bar.import")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`${JOURNAL_BASE}/trades/new`}>{t("bar.plan")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link to={`${JOURNAL_BASE}/trades/new`}>{t("bar.addTrade")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`${JOURNAL_BASE}/coach`}>{t("bar.askAi")}</Link>
        </Button>
      </div>
    </div>
  );
}
