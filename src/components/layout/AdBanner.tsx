import { useLanguage } from "@/contexts/LanguageContext";

export function AdBanner() {
  const { t } = useLanguage();

  return (
    <div
      id="hedgefun-ad-banner"
      className="w-full bg-surface border-b border-border flex items-center justify-center"
      style={{ minHeight: "90px" }}
      aria-label="Advertisement"
    >
      <span className="text-xs text-muted-foreground">{t("advertisement")}</span>
    </div>
  );
}
