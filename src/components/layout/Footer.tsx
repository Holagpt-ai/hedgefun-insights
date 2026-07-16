import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, Apple, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { AuthModals } from "@/components/auth/AuthModals";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { BRAND } from "@/config/brand";



export function Footer() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [loading, setLoading] = useState(false);
  const [footerStatus, setFooterStatus] = useState<"idle" | "success" | "duplicate" | "invalid" | "error">("idle");

  const handleSubscribe = async () => {
    setLoading(true);
    setFooterStatus("idle");
    const result = await subscribeToNewsletter(email, "footer");
    setFooterStatus(result.status);
    if (result.status === "success") setEmail("");
    setLoading(false);
  };

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
      setAuthMode("login");
    } else if (to === "__auth_signup__") {
      setAuthMode("signup");
    } else {
      navigate(to);
    }
  };

  return (
    <footer className="bg-footer-bg text-footer-text w-full">
      <div className="max-w-7xl mx-auto px-4 py-7">
        {/* Row 1 — Link columns + right column (Google sign-in + newsletter) */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-7">
          {LINK_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-semibold tracking-wider text-footer-text/70 mb-3">
                {section.title}
              </h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => handleLinkClick(link.to)}
                      className="text-sm text-footer-text hover:text-white transition-colors"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Right column — spans 2 cols on md+ */}
          <div className="col-span-2">
            {/* Google sign-in button */}
            <button
              onClick={() => setAuthMode("login")}
              className="w-full flex items-center justify-center gap-2.5 h-10 rounded-full border border-white/20 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors mb-5"
            >
              <span className="text-base font-bold" style={{ color: "#4285F4" }}>G</span>
              {t("signInGoogle")}
            </button>

            {/* Newsletter */}
            <p className="text-xs font-semibold tracking-wider text-footer-text/70 mb-1">
              {t("marketNewsletter").toUpperCase()}
            </p>
            <p className="text-sm text-footer-text mb-3">
              {t("newsletterDesc")}
            </p>
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 bg-white text-foreground border-0"
              />
              <Button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full bg-accent-blue hover:bg-accent-blue-hover text-white h-10 disabled:opacity-50"
              >
                {loading ? "Subscribing..." : t("subscribe")}
              </Button>
              {footerStatus === "success" && (
                <p className="text-xs text-green-500">✓ Subscribed!</p>
              )}
              {footerStatus === "duplicate" && (
                <p className="text-xs text-yellow-500">Already subscribed</p>
              )}
              {footerStatus === "invalid" && (
                <p className="text-xs text-red-400">Enter a valid email</p>
              )}
              {footerStatus === "error" && (
                <p className="text-xs text-red-400">Try again</p>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 — Single compact bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/10">
          {/* Left — copyright */}
          <span className="text-xs text-footer-text/50 shrink-0">
            © {new Date().getFullYear()} {BRAND.displayDomain}. {t("allRightsReserved")}
          </span>


          {/* Right — app badges + theme toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/download")}
              className="flex items-center gap-1.5 text-xs text-footer-text rounded-full px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Apple className="h-3.5 w-3.5" />
              <span>App Store</span>
            </button>
            <button
              onClick={() => navigate("/download")}
              className="flex items-center gap-1.5 text-xs text-footer-text rounded-full px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Play className="h-3.5 w-3.5" />
              <span>Google Play</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-xs text-footer-text rounded-full px-3 py-1.5"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>{theme === "light" ? t("lightMode") : t("darkMode")}</span>
              <Moon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <AuthModals
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitch={setAuthMode}
      />
    </footer>
  );
}
