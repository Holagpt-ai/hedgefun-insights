import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ComingSoonCard } from "../components/ComingSoonCard";
import { HonestState } from "../components/HonestState";
import { useJournalLang, useJournalT } from "../i18n";
import { deleteOwnedAccount } from "../lib/delete-owned";
import { SETTINGS_KEY, readJson, writeJson } from "../lib/storage";
import { isUuid } from "../ledger/persist-contract";
import { money } from "../lib/format";
import type { JournalLiveClient } from "../lib/live-client";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";
import { ImportWizard } from "./ImportWizard";

const SECTIONS = ["profile", "ai-memory", "data-quality", "imports", "accounts", "risk", "privacy", "deletion"] as const;
const liveClient = supabase as unknown as JournalLiveClient;

export function SettingsPage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") ?? "profile";
  const { dataQualityIssues, dataQualityCount, accounts, equity, reconciliationState, mode, refresh } = useJournalWorkspace();
  const { user } = useAuth();
  const [accountToDelete, setAccountToDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
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
          {accountMessage ? <p className="text-xs text-muted-foreground">{accountMessage}</p> : null}
          {accountError ? <p className="text-xs journal-loss">{accountError}</p> : null}
          {accounts.map((account) => (
            <div key={account.id} className="journal-card p-3 text-sm space-y-2">
              <div className="font-semibold">{account.name}</div>
              <div>{t("settings.reported")}: {account.reportedBalance} {account.baseCurrency}</div>
              <div>{t("settings.derived")}: {money(equity, lang)}</div>
              <div className="text-xs text-muted-foreground">{reconciliationState.state}</div>
              {mode !== "demo" && isUuid(account.id) ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setAccountToDelete({ id: account.id, name: account.name });
                    setConfirmName("");
                    setAccountError(null);
                  }}
                >
                  {t("settings.deleteAccount")}
                </Button>
              ) : null}
            </div>
          ))}
          {mode === "demo" ? <p className="text-xs text-muted-foreground">{t("settings.demoNoDelete")}</p> : null}
          <AlertDialog open={accountToDelete != null} onOpenChange={(open) => { if (!open) setAccountToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("settings.deleteAccount")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("settings.confirmDeleteAccount", { name: accountToDelete?.name ?? "" })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                aria-label={t("settings.confirmAccountName")}
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>{t("notebook.cancel")}</AlertDialogCancel>
                <Button
                  type="button"
                  disabled={deleting || !accountToDelete || confirmName.trim() !== (accountToDelete?.name ?? "")}
                  onClick={async () => {
                    if (!user || !accountToDelete || deleting) return;
                    setDeleting(true);
                    setAccountError(null);
                    const result = await deleteOwnedAccount(
                      { mode: "live", userId: user.id, client: liveClient },
                      { accountId: accountToDelete.id, name: accountToDelete.name, confirmName },
                    );
                    setDeleting(false);
                    if (!result.ok) {
                      setAccountError(
                        result.skipped === "demo"
                          ? t("settings.demoNoDelete")
                          : result.code === "not_empty"
                            ? t("settings.accountNotEmpty")
                            : result.error ?? t("settings.accountDeleteFailed"),
                      );
                      return;
                    }
                    setAccountToDelete(null);
                    setAccountMessage(t("settings.accountDeleted"));
                    await refresh();
                  }}
                >
                  {t("settings.deleteAccount")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
