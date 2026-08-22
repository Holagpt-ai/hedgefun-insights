import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComingSoonCard } from "../components/ComingSoonCard";
import { HonestState } from "../components/HonestState";
import { useJournalLang, useJournalT } from "../i18n";
import { SETTINGS_KEY, readJson, writeJson } from "../lib/storage";
import { money } from "../lib/format";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import { ImportWizard } from "./ImportWizard";

const SECTIONS = ["profile", "ai-memory", "data-quality", "imports", "accounts", "risk", "privacy", "deletion"] as const;

export function SettingsPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") ?? "profile";
  const { dataQualityIssues, dataQualityCount, accounts, equity, reconciliationState } = useJournalWorkspace();
  const settings = readJson<Record<string, string>>(SETTINGS_KEY, {});

  const setSection = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === "profile") next.delete("section");
    else next.set("section", value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">{t("settings.title")}</h1>
      <div className="flex flex-wrap gap-1">
        {SECTIONS.map((id) => (
          <Button key={id} size="sm" variant={section === id || (id === "profile" && !params.get("section")) ? "default" : "outline"} onClick={() => setSection(id)}>
            {id === "ai-memory" ? t("nav.aiMemory")
              : id === "data-quality" ? t("nav.dataQuality")
                : id === "imports" ? t("nav.imports")
                  : id === "accounts" ? t("nav.accounts")
                    : id === "profile" ? t("settings.profile")
                      : id === "risk" ? t("settings.risk")
                        : id === "privacy" ? t("settings.privacy")
                          : t("settings.deletion")}
          </Button>
        ))}
      </div>
      {section === "profile" || !SECTIONS.includes(section as typeof SECTIONS[number]) ? (
        <div className="journal-card p-3 space-y-2 max-w-md">
          <Field label={t("onboarding.timezone")} defaultValue={settings.timezone ?? "America/New_York"} name="timezone" />
          <Field label={t("onboarding.tone")} defaultValue={settings.tone ?? "analytical"} name="tone" />
          <Save />
        </div>
      ) : null}
      {section === "ai-memory" ? (
        <div className="space-y-2">
          <h2 className="font-semibold">{t("settings.memory")}</h2>
          <HonestState kind="empty" title={t("settings.memoryEmpty")} />
        </div>
      ) : null}
      {section === "data-quality" ? (
        <div className="journal-card p-3">
          <h2 className="font-semibold">{t("settings.dqTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("overview.issues", { n: dataQualityCount })}</p>
          <ul className="text-sm mt-2">
            {dataQualityIssues.map((issue) => (
              <li key={issue.key} className="flex justify-between"><span>{issue.key}</span><span className="tabular-nums">{issue.count}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      {section === "imports" ? (
        <div className="space-y-3">
          <p className="text-sm">{t("settings.csvActive")}</p>
          <ImportWizard />
          <p className="text-xs text-muted-foreground">{t("settings.brokerInactive")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.exchangeInactive")}</p>
          <div className="grid md:grid-cols-2 gap-2">
            <ComingSoonCard kind="broker" />
            <ComingSoonCard kind="exchange" />
          </div>
        </div>
      ) : null}
      {section === "accounts" ? (
        <div className="space-y-2">
          <h2 className="font-semibold">{t("settings.accountsTitle")}</h2>
          {accounts.map((account) => (
            <div key={account.id} className="journal-card p-3 text-sm">
              <div className="font-semibold">{account.name}</div>
              <div>{t("settings.reported")}: {account.reportedBalance} {account.baseCurrency}</div>
              <div>{t("settings.derived")}: {money(equity, lang)}</div>
              <div className="text-xs text-muted-foreground">{reconciliationState.state}</div>
            </div>
          ))}
        </div>
      ) : null}
      {section === "risk" ? (
        <div className="journal-card p-3 space-y-2 max-w-md">
          <Field label={t("onboarding.maxLoss")} defaultValue={settings.maxLoss ?? ""} name="maxLoss" />
          <Field label={t("onboarding.maxTrades")} defaultValue={settings.maxTrades ?? ""} name="maxTrades" />
          <Save />
        </div>
      ) : null}
      {section === "privacy" ? <p className="text-sm">{t("onboarding.privacy")}</p> : null}
      {section === "deletion" ? <p className="text-sm">{t("settings.deleteHint")}</p> : null}
    </div>
  );
}

function Field({ label, defaultValue, name }: { label: string; defaultValue: string; name: string }) {
  return (
    <label className="text-xs font-semibold block space-y-1">
      <span>{label}</span>
      <Input defaultValue={defaultValue} name={name} onBlur={(e) => {
        writeJson(SETTINGS_KEY, { ...readJson(SETTINGS_KEY, {}), [name]: e.target.value });
      }} />
    </label>
  );
}

function Save() {
  const t = useJournalT();
  return <Button size="sm" type="button">{t("settings.save")}</Button>;
}
