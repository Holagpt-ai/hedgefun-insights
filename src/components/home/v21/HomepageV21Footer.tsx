import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, Apple, Play } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { AuthModals } from "@/components/auth/AuthModals";
import { trackAuthHandoff } from "@/lib/analytics/public-events";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "react-router-dom";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { homepageV21Copy, type HomepageV21Lang } from "@/lib/homepage/homepage-v21-copy";
import { BRAND } from "@/config/brand";

export function HomepageV21Footer() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { t, language } = useLanguage();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const v21 = homepageV21Copy(lang);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [email, setEmail] = useState("");

  const LINK_SECTIONS = [
    {
      title: t("footerSections"),
      links: [
        { label: t("stocks"), to: "/stocks" },
        { label: t("ipos"), to: "/ipos/recent" },
        { label: t("etfs"), to: "/etfs" },
        { label: t("articles"), to: "/articles" },
      ],
    },
    {
      title: t("footerServices"),
      links: [
        { label: t("hedgefunPro"), to: "/pro" },
        { label: t("freeNewsletter"), to: "/newsletter" },
        { label: t("getSupport"), to: "/support" },
        { label: t("downloadApp"), to: "/download" },
      ],
    },
    {
      title: t("footerWebsite"),
      links: [
        { label: t("logIn"), to: "__auth_login__" },
        { label: t("createAccount"), to: "__auth_signup__" },
        { label: t("sitemap"), to: "/sitemap" },
        { label: t("advertise"), to: "/advertise" },
        { label: t("faq"), to: "/faq" },
      ],
    },
    {
      title: t("footerCompany"),
      links: [
        { label: t("about"), to: "/about" },
        { label: t("contactUs"), to: "/contact" },
        { label: t("termsOfUse"), to: "/terms" },
        { label: t("privacyPolicy"), to: "/privacy" },
        { label: t("dataDisclaimer"), to: "/disclaimer" },
        { label: t("affiliateProgram"), to: "/affiliates" },
      ],
    },
  ];

  const handleLinkClick = (to: string) => {
    if (to === "__auth_login__") {
      trackAuthHandoff({ mode: "login", returnPath: "/", source: "homepage_v21_footer_login" });
      setAuthMode("login");
    } else if (to === "__auth_signup__") {
      trackAuthHandoff({ mode: "signup", returnPath: "/", source: "homepage_v21_footer_signup" });
      setAuthMode("signup");
    } else {
      navigate(to);
    }
  };

  return (
    <footer className="hp-footer w-full">
      <div className="foot-in mx-auto max-w-[1460px] px-5 pt-10">
        <div className="foot-grid grid gap-6 md:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_1.4fr]">
          {LINK_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="mb-3 text-xs font-semibold tracking-widest text-white uppercase">{section.title}</h4>
              <ul className="flex flex-col gap-2 text-[13.5px]">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={() => handleLinkClick(link.to)}
                      className="text-[#aebdd2] hover:text-white"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <button
              type="button"
              onClick={() => {
                trackAuthHandoff({ mode: "login", returnPath: "/", source: "homepage_v21_footer_google" });
                setAuthMode("login");
              }}
              className="google-btn mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-gray-800"
            >
              <span style={{ color: "#4285F4" }} className="font-bold">
                G
              </span>
              {t("signInGoogle")}
            </button>
            <div className="nl-label text-xs font-semibold tracking-widest text-white uppercase">
              {t("marketNewsletter")}
            </div>
            <p className="nl-note mt-1 text-sm text-[#aebdd2]">{v21.footerNewsletterNote}</p>
            <form
              className="nl-form mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                navigate("/newsletter");
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                aria-label={t("emailPlaceholder")}
                className="h-[42px] rounded-lg border border-[#26395a] bg-[#0f2038] px-3 text-sm text-white"
              />
              <button
                type="submit"
                className="hp-btn hp-btn-blue min-h-[42px] rounded-lg text-sm font-bold"
              >
                {t("subscribe")}
              </button>
            </form>
            <p className="mt-2 text-xs text-[#7186a5]">{v21.footerNewsletterDeferred}</p>
          </div>
        </div>
      </div>

      <div className="foot-bottom mx-auto mt-4 flex max-w-[1460px] flex-wrap items-center gap-2 border-t border-[#1b2c47] px-5 py-4 text-xs text-[#7186a5]">
        <span>
          © {new Date().getFullYear()} {BRAND.displayDomain}. {t("allRightsReserved")}
        </span>
        <span className="flex-1" />
        <button type="button" className="store-chip" onClick={() => navigate("/download")}>
          <Apple className="mr-1 h-3.5 w-3.5" />
          App Store
        </button>
        <button type="button" className="store-chip" onClick={() => navigate("/download")}>
          <Play className="mr-1 h-3.5 w-3.5" />
          Google Play
        </button>
        <button type="button" className="store-chip" onClick={toggleTheme}>
          <Sun className="mr-1 h-3.5 w-3.5" />
          {theme === "light" ? t("lightMode") : t("darkMode")}
          <Moon className="ml-1 h-3.5 w-3.5" />
        </button>
      </div>

      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </footer>
  );
}