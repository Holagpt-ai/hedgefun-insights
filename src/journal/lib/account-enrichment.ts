import type { JournalAccount } from "../workspace/JournalWorkspace";
import { ONBOARDING_KEY, readUserJson, SETTINGS_KEY } from "./storage";

/** Apply user-entered onboarding beginning balance when canonical rows carry no balance evidence. */
export function enrichLiveAccountsWithUserPrefs(
  accounts: JournalAccount[],
  userId: string | null | undefined,
): JournalAccount[] {
  if (!userId || accounts.length === 0) return accounts;

  const onboarding = readUserJson<Record<string, string>>(ONBOARDING_KEY, userId, {});
  const settings = readUserJson<Record<string, unknown>>(SETTINGS_KEY, userId, {});
  const profile = (settings.profile as Record<string, string> | undefined) ?? onboarding;
  const raw = profile.beginning;
  const parsed = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return accounts;

  return accounts.map((account, index) => {
    if (account.beginningBalance != null) return account;
    if (index === 0 || account.id === "live-default") {
      return { ...account, beginningBalance: parsed };
    }
    return account;
  });
}

export function resolveBeginningBalanceForScope(
  accounts: readonly JournalAccount[],
  selectedAccountId: string,
): number | null {
  if (selectedAccountId === "all") {
    const known = accounts.filter((a) => a.beginningBalance != null);
    if (known.length === 0) return null;
    if (known.length !== accounts.length) return null;
    return known.reduce((sum, a) => sum + (a.beginningBalance ?? 0), 0);
  }
  const selected = accounts.find((a) => a.id === selectedAccountId);
  return selected?.beginningBalance ?? null;
}

export function resolveReportedBalanceForScope(
  accounts: readonly JournalAccount[],
  selectedAccountId: string,
): { reportedBalance: number | null; reportedAsOf: string | null } {
  if (selectedAccountId === "all") {
    if (accounts.length === 0) {
      return { reportedBalance: null, reportedAsOf: null };
    }
    const allReported = accounts.every((a) => a.reportedBalance != null);
    if (!allReported) {
      return { reportedBalance: null, reportedAsOf: null };
    }
    const asOfValues = accounts.map((a) => a.reportedAsOf).filter((v): v is string => Boolean(v?.trim()));
    const uniqueAsOf = new Set(asOfValues);
    if (uniqueAsOf.size > 1) {
      return { reportedBalance: null, reportedAsOf: null };
    }
    const reportedBalance = accounts.reduce((sum, a) => sum + (a.reportedBalance ?? 0), 0);
    return {
      reportedBalance,
      reportedAsOf: asOfValues[0] ?? null,
    };
  }
  const selected = accounts.find((a) => a.id === selectedAccountId);
  return {
    reportedBalance: selected?.reportedBalance ?? null,
    reportedAsOf: selected?.reportedAsOf ?? null,
  };
}
