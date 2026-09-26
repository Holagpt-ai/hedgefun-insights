import { describe, expect, it } from "vitest";
import {
  getAnalystInteractionLanguage,
  getEffectiveLanguage,
  isTradingSurfaceRoute,
  LOCALE_V1_POLICY,
  shouldShowPublicLanguageToggle,
} from "@/config/locale-v1.policy";
import { journalMessage } from "@/journal/i18n";

describe("locale v1 policy", () => {
  it("identifies trading dashboard routes", () => {
    expect(isTradingSurfaceRoute("/dashboard")).toBe(true);
    expect(isTradingSurfaceRoute("/dashboard/journal/trades")).toBe(true);
    expect(isTradingSurfaceRoute("/dashboard/screeners")).toBe(true);
    expect(isTradingSurfaceRoute("/")).toBe(false);
    expect(isTradingSurfaceRoute("/account")).toBe(false);
  });

  it("forces English on trading surfaces while preserving stored preference elsewhere", () => {
    expect(getEffectiveLanguage("es", "/dashboard/watchlist")).toBe("en");
    expect(getEffectiveLanguage("es", "/")).toBe("es");
    expect(getEffectiveLanguage("en", "/dashboard/ai")).toBe("en");
  });

  it("hides public language toggle on trading surfaces", () => {
    expect(shouldShowPublicLanguageToggle("/dashboard/pre-market")).toBe(false);
    expect(shouldShowPublicLanguageToggle("/watchlist")).toBe(true);
  });

  it("keeps analyst interaction English on dashboard", () => {
    expect(getAnalystInteractionLanguage("es", "/dashboard/ai")).toBe("en");
  });

  it("preserves legacy and primary storage key names", () => {
    expect(LOCALE_V1_POLICY.storageKey).toBe("stocksist-lang");
    expect(LOCALE_V1_POLICY.legacyStorageKey).toBe("hedgefun-lang");
  });

  it("journal messages stay English when effective language is forced en", () => {
    const enLabel = journalMessage("en", "nav.trades");
    const esLabel = journalMessage("es", "nav.trades");
    expect(enLabel).toBe("Trades");
    expect(esLabel).not.toBe(enLabel);
    expect(journalMessage(getEffectiveLanguage("es", "/dashboard/journal"), "nav.trades")).toBe(enLabel);
  });

  it("public marketing keys remain translatable off-dashboard", () => {
    expect(getEffectiveLanguage("es", "/about")).toBe("es");
  });
});
