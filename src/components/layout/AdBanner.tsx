import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export function AdBanner() {
  const { t } = useLanguage();
  const { profile } = useAuth();

  // Hide ads for Pro subscribers
  if (profile?.plan === "pro") return null;

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
