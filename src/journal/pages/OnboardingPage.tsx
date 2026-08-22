import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useJournalT } from "../i18n";
import { ONBOARDING_KEY, SETTINGS_KEY, readJson, writeJson } from "../lib/storage";
import { JOURNAL_BASE } from "../nav";

const STEPS = ["s1", "s2", "s3", "s4", "s5"] as const;

export function OnboardingPage() {
  const t = useJournalT();
  const navigate = useNavigate();
  const saved = readJson<Record<string, string | string[]>>(ONBOARDING_KEY, {});
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(saved);

  const persist = (next = form) => writeJson(ONBOARDING_KEY, next);

  const finish = () => {
    persist({ ...form, complete: "true" });
    writeJson(SETTINGS_KEY, { ...readJson(SETTINGS_KEY, {}), profile: form });
    navigate(JOURNAL_BASE);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-lg font-bold">{t("onboarding.title")}</h1>
      <p className="text-xs text-muted-foreground">{t("onboarding.step", { n: step + 1 })} · {t(`onboarding.${STEPS[step]}`)} · {t("onboarding.retain")}</p>
      {step === 0 ? (
        <div className="grid gap-2">
          <Field label={t("onboarding.experience")} value={String(form.experience ?? "")} onChange={(v) => setForm({ ...form, experience: v })} />
          <Field label={t("onboarding.skill")} value={String(form.skill ?? "")} onChange={(v) => setForm({ ...form, skill: v })} />
          <Field label={t("onboarding.style")} value={String(form.style ?? "")} onChange={(v) => setForm({ ...form, style: v })} />
          <Field label={t("onboarding.timezone")} value={String(form.timezone ?? "America/New_York")} onChange={(v) => setForm({ ...form, timezone: v })} />
          <Field label={t("onboarding.tone")} value={String(form.tone ?? "analytical")} onChange={(v) => setForm({ ...form, tone: v })} />
        </div>
      ) : null}
      {step === 1 ? (
        <div className="grid gap-2">
          <Field label={t("onboarding.accountName")} value={String(form.accountName ?? "")} onChange={(v) => setForm({ ...form, accountName: v })} />
          <Field label={t("onboarding.currency")} value={String(form.currency ?? "USD")} onChange={(v) => setForm({ ...form, currency: v })} />
          <Field label={t("onboarding.beginning")} value={String(form.beginning ?? "")} onChange={(v) => setForm({ ...form, beginning: v })} />
        </div>
      ) : null}
      {step === 2 ? (
        <div className="grid gap-2">
          <Field label={t("onboarding.goals")} value={String(form.goals ?? "")} onChange={(v) => setForm({ ...form, goals: v })} />
          <Field label={t("onboarding.challenges")} value={String(form.challenges ?? "")} onChange={(v) => setForm({ ...form, challenges: v })} />
        </div>
      ) : null}
      {step === 3 ? (
        <div className="grid gap-2">
          <Field label={t("onboarding.maxLoss")} value={String(form.maxLoss ?? "")} onChange={(v) => setForm({ ...form, maxLoss: v })} />
          <Field label={t("onboarding.maxTrades")} value={String(form.maxTrades ?? "")} onChange={(v) => setForm({ ...form, maxTrades: v })} />
          <Field label={t("onboarding.riskPct")} value={String(form.riskPct ?? "")} onChange={(v) => setForm({ ...form, riskPct: v })} />
        </div>
      ) : null}
      {step === 4 ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.privacy === "true"} onCheckedChange={(v) => setForm({ ...form, privacy: v ? "true" : "false" })} />
          {t("onboarding.privacy")}
        </label>
      ) : null}
      <div className="flex gap-2">
        {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>{t("onboarding.back")}</Button> : null}
        {step < 4 ? <Button onClick={() => { persist(); setStep(step + 1); }}>{t("onboarding.next")}</Button> : <Button onClick={finish}>{t("onboarding.finish")}</Button>}
        <Button variant="ghost" onClick={finish}>{t("onboarding.skip")}</Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs font-semibold space-y-1 block">
      <span>{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
