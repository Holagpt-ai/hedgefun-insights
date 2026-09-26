import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getEffectiveLanguage,
  shouldShowPublicLanguageToggle,
  type LocaleCode,
} from "@/config/locale-v1.policy";

export function useEffectiveLanguage(): LocaleCode {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  return getEffectiveLanguage(language, pathname);
}

export function useShowPublicLanguageToggle(): boolean {
  const { pathname } = useLocation();
  return shouldShowPublicLanguageToggle(pathname);
}
