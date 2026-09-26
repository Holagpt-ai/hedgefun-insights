/**
 * V1 locale policy (Prompt #20):
 * - Trading dashboard surfaces render in English only.
 * - Public/marketing shell may use LanguageContext EN/ES (~80 keys).
 * - Journal i18n resources remain for a future full launch; V1 forces English on /dashboard/*.
 */

export type LocaleCode = "en" | "es";

export const LOCALE_V1_POLICY = {
  tradingSurfacesEnglishOnly: true,
  publicMarketingI18nEnabled: true,
  /** Persisted keys — do not rename. */
  storageKey: "stocksist-lang",
  legacyStorageKey: "hedgefun-lang",
  profileField: "preferred_language",
} as const;

export function isTradingSurfaceRoute(pathname: string): boolean {
  return pathname.startsWith("/dashboard");
}

export function getEffectiveLanguage(
  stored: LocaleCode,
  pathname: string,
): LocaleCode {
  if (LOCALE_V1_POLICY.tradingSurfacesEnglishOnly && isTradingSurfaceRoute(pathname)) {
    return "en";
  }
  return stored;
}

export function shouldShowPublicLanguageToggle(pathname: string): boolean {
  if (!LOCALE_V1_POLICY.publicMarketingI18nEnabled) return false;
  return !isTradingSurfaceRoute(pathname);
}

/** AI Analyst voice + future model locale — trading surfaces use English in V1. */
export function getAnalystInteractionLanguage(
  stored: LocaleCode,
  pathname: string,
): LocaleCode {
  return getEffectiveLanguage(stored, pathname);
}
