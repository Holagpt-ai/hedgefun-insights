import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { calculatePosition, computePlannedRiskFromPlan, formatMoney, microsToNumber, validateSymbol } from "../calc";
import type { AssetClass, Direction, ExecutionAction, ExecutionInput, TradeInput } from "../calc/types";
import { HonestState } from "../components/HonestState";
import { useJournalLang, useJournalT } from "../i18n";
import { DRAFT_KEY, readJson, writeJson } from "../lib/storage";
import { saveTrade } from "../ledger/saveTrade";
import { JOURNAL_BASE } from "../nav";
import { useJournalWorkspace } from "../workspace/JournalWorkspace";

interface DraftFill {
  action: ExecutionAction;
  quantity: string;
  price: string;
  timestampUtc: string;
  commission: string;
}

interface Draft {
  assetClass: AssetClass;
  symbol: string;
  direction: Direction;
  accountId: string;
  playbookName: string;
  plannedEntry: string;
  plannedStop: string;
  plannedTarget: string;
  plannedSize: string;
  plannedRisk: string;
  thesis: string;
  strike: string;
  expiration: string;
  right: "call" | "put";
  executions: DraftFill[];
}

const emptyFill = (): DraftFill => ({
  action: "buy",
  quantity: "100",
  price: "",
  timestampUtc: new Date().toISOString().slice(0, 16),
  commission: "0",
});

const emptyDraft = (): Draft => ({
  assetClass: "stock",
  symbol: "",
  direction: "long",
  accountId: "live-default",
  playbookName: "",
  plannedEntry: "",
  plannedStop: "",
  plannedTarget: "",
  plannedSize: "",
  plannedRisk: "",
  thesis: "",
  strike: "",
  expiration: "",
  right: "call",
  executions: [emptyFill(), { ...emptyFill(), action: "sell" }],
});

export function NewTradePage() {
  const t = useJournalT();
  const lang = useJournalLang();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { mode, accounts, onLiveTradeSaved } = useJournalWorkspace();
  const [draft, setDraft] = useState<Draft>(() => (mode === "demo" ? emptyDraft() : readJson(DRAFT_KEY, emptyDraft())));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Consume the untrusted symbol query once, matching the existing handoff contract.
  useEffect(() => {
    const raw = searchParams.get("symbol");
    if (raw === null) return;
    const symbol = validateSymbol(raw);
    if (symbol) {
      setDraft((current) => ({ ...current, symbol }));
    }
    const next = new URLSearchParams(searchParams);
    next.delete("symbol");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === "demo") return;
    writeJson(DRAFT_KEY, draft);
  }, [draft, mode]);

  const trade = useMemo(() => toTrade(draft), [draft]);
  const preview = useMemo(() => calculatePosition(trade), [trade]);
  const symbolOk = Boolean(validateSymbol(draft.symbol));
  const locale = lang === "es" ? "es-ES" : "en-US";

  const onSave = async () => {
    setError(null);
    if (!symbolOk) {
      setError(t("new.invalidSymbol"));
      return;
    }
    if (preview.overExitBlocked) {
      setError(t("new.overExit"));
      return;
    }
    if (!user) {
      setError(t("state.error"));
      return;
    }
    setSaving(true);
    const persistMode = mode === "demo" ? "demo" : "live";
    const result = await saveTrade(
      {
        ...trade,
        id: crypto.randomUUID(),
        accountId:
          persistMode === "demo"
            ? trade.accountId
            : trade.accountId.startsWith("demo-")
              ? "live-default"
              : trade.accountId,
      },
      { mode: persistMode, userId: user.id, client: supabase as never },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.skipped === "demo" ? t("new.demoBlocked") : result.error ?? t("new.saveFailed"));
      return;
    }
    writeJson(DRAFT_KEY, emptyDraft());
    await onLiveTradeSaved();
    navigate(`${JOURNAL_BASE}/trades`);
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <h1 className="text-lg font-bold">{t("new.title")}</h1>
      {mode === "demo" ? <HonestState kind="demo" body={t("new.demoBlocked")} /> : <p className="text-xs text-muted-foreground">{t("new.draftSaved")}</p>}
      <Tabs value={draft.assetClass === "equity_option" ? "options" : draft.assetClass === "crypto_spot" ? "crypto" : "stock"} onValueChange={(v) => setDraft({ ...draft, assetClass: v === "options" ? "equity_option" : v === "crypto" ? "crypto_spot" : "stock" })}>
        <TabsList>
          <TabsTrigger value="stock">{t("new.stock")}</TabsTrigger>
          <TabsTrigger value="options">{t("new.options")}</TabsTrigger>
          <TabsTrigger value="crypto">{t("new.crypto")}</TabsTrigger>
        </TabsList>
        {draft.assetClass === "equity_option" ? (
          <TabsContent value="options">
            <div className="grid grid-cols-3 gap-2">
              <Labeled label={t("new.strike")}><Input value={draft.strike} onChange={(e) => setDraft({ ...draft, strike: e.target.value })} /></Labeled>
              <Labeled label={t("new.expiration")}><Input type="date" value={draft.expiration} onChange={(e) => setDraft({ ...draft, expiration: e.target.value })} /></Labeled>
              <Labeled label={t("new.right")}>
                <Select value={draft.right} onValueChange={(v) => setDraft({ ...draft, right: v as "call" | "put" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">{t("new.call")}</SelectItem>
                    <SelectItem value="put">{t("new.put")}</SelectItem>
                  </SelectContent>
                </Select>
              </Labeled>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label={t("new.symbol")}>
          <Input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} />
          {!draft.symbol || symbolOk ? null : <p className="text-[11px] journal-loss">{t("validation.symbol")}</p>}
        </Labeled>
        <Labeled label={t("new.direction")}>
          <Select value={draft.direction} onValueChange={(v) => setDraft({ ...draft, direction: v as Direction })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="long">{t("trades.long")}</SelectItem>
              <SelectItem value="short">{t("trades.short")}</SelectItem>
            </SelectContent>
          </Select>
        </Labeled>
        <Labeled label={t("new.account")}>
          <Select value={draft.accountId} onValueChange={(v) => setDraft({ ...draft, accountId: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Labeled>
        <Labeled label={t("new.playbook")}><Input value={draft.playbookName} onChange={(e) => setDraft({ ...draft, playbookName: e.target.value })} /></Labeled>
        <Labeled label={t("new.plannedEntry")}><Input value={draft.plannedEntry} onChange={(e) => setDraft({ ...draft, plannedEntry: e.target.value })} /></Labeled>
        <Labeled label={t("new.plannedStop")}><Input value={draft.plannedStop} onChange={(e) => setDraft({ ...draft, plannedStop: e.target.value })} /></Labeled>
        <Labeled label={t("new.plannedTarget")}><Input value={draft.plannedTarget} onChange={(e) => setDraft({ ...draft, plannedTarget: e.target.value })} /></Labeled>
        <Labeled label={t("new.plannedRisk")}><Input value={draft.plannedRisk} onChange={(e) => setDraft({ ...draft, plannedRisk: e.target.value })} /></Labeled>
      </div>
      <Labeled label={t("new.thesis")}><Textarea value={draft.thesis} onChange={(e) => setDraft({ ...draft, thesis: e.target.value })} /></Labeled>
      <div className="journal-card p-3 space-y-2">
        <div className="flex justify-between items-center">
          <div className="journal-card-hd">{t("new.executions")}</div>
          <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, executions: [...draft.executions, emptyFill()] })}>{t("new.addFill")}</Button>
        </div>
        {draft.executions.map((fill, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select value={fill.action} onValueChange={(v) => updateFill(setDraft, draft, i, { action: v as ExecutionAction })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">{t("new.buy")}</SelectItem>
                <SelectItem value="sell">{t("new.sell")}</SelectItem>
                <SelectItem value="short">{t("new.short")}</SelectItem>
                <SelectItem value="cover">{t("new.cover")}</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder={t("new.qty")} value={fill.quantity} onChange={(e) => updateFill(setDraft, draft, i, { quantity: e.target.value })} />
            <Input placeholder={t("new.price")} value={fill.price} onChange={(e) => updateFill(setDraft, draft, i, { price: e.target.value })} />
            <Input type="datetime-local" value={fill.timestampUtc} onChange={(e) => updateFill(setDraft, draft, i, { timestampUtc: e.target.value })} />
            <Input placeholder={t("new.commission")} value={fill.commission} onChange={(e) => updateFill(setDraft, draft, i, { commission: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="journal-card p-3 text-sm">
        <div className="journal-card-hd">{t("new.preview")}</div>
        <p className="tabular-nums mt-1">{formatMoney(preview.netRealizedPnl, locale)} · {preview.outcome}</p>
        {preview.overExitBlocked ? <p className="journal-loss text-xs mt-1">{t("new.overExit")}</p> : null}
      </div>
      {error ? <p className="text-xs journal-loss">{error}</p> : null}
      <Button onClick={() => void onSave()} disabled={saving || preview.overExitBlocked || mode === "demo"}>{t("new.save")}</Button>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-semibold space-y-1 block">
      <span>{label}</span>
      {children}
    </label>
  );
}

function updateFill(setDraft: (d: Draft) => void, draft: Draft, index: number, patch: Partial<DraftFill>) {
  const executions = draft.executions.map((fill, i) => (i === index ? { ...fill, ...patch } : fill));
  setDraft({ ...draft, executions });
}

function toTrade(draft: Draft): TradeInput {
  const executions: ExecutionInput[] = draft.executions
    .filter((fill) => fill.price && fill.quantity)
    .map((fill, i) => ({
      id: `draft-${i}`,
      timestamp: fill.timestampUtc,
      timestampUtc: new Date(fill.timestampUtc).toISOString(),
      originalTimezone: "America/New_York",
      action: fill.action,
      quantity: fill.quantity,
      price: fill.price,
      commission: fill.commission || 0,
      multiplier: draft.assetClass === "equity_option" ? 100 : 1,
    }));
  const planInputs = {
    assetClass: draft.assetClass,
    plannedEntry: draft.plannedEntry || null,
    plannedStop: draft.plannedStop || null,
    plannedSize: draft.plannedSize || null,
    legs: draft.assetClass === "equity_option" && draft.strike
      ? [{ id: "leg-1", action: "buy" as const, right: draft.right, strike: draft.strike, expiration: draft.expiration, contracts: draft.executions[0]?.quantity ?? 1, multiplier: 100, status: "open" as const }]
      : undefined,
  };
  const derivedRisk = computePlannedRiskFromPlan(planInputs);
  return {
    id: "draft",
    accountId: draft.accountId.startsWith("demo-") ? "live-default" : draft.accountId,
    assetClass: draft.assetClass,
    instrument: draft.assetClass === "equity_option" ? "option" : draft.assetClass === "crypto_spot" ? "spot" : "share",
    symbol: validateSymbol(draft.symbol) ?? draft.symbol,
    direction: draft.direction,
    status: "open",
    executions,
    plannedEntry: draft.plannedEntry || null,
    plannedStop: draft.plannedStop || null,
    plannedTarget: draft.plannedTarget || null,
    plannedSize: draft.plannedSize || null,
    plannedRisk: draft.plannedRisk || (derivedRisk != null ? microsToNumber(derivedRisk) : null),
    playbookName: draft.playbookName || null,
    thesis: draft.thesis || null,
    planned: true,
    legs: planInputs.legs,
  };
}
