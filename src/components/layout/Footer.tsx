import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Sun, Moon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";

const LINK_SECTIONS = [
  {
    title: "SECTIONS",
    links: [
      { label: "Stocks", to: "/stocks" },
      { label: "IPOs", to: "/ipos" },
      { label: "ETFs", to: "/etfs" },
      { label: "Blog", to: "/articles" },
    ],
  },
  {
    title: "SERVICES",
    links: [
      { label: "HedgeFun Pro", to: "/pro" },
      { label: "Free Newsletter", to: "/newsletter" },
      { label: "Get Support", to: "/support" },
      { label: "Download App", to: "/download" },
    ],
  },
  {
    title: "WEBSITE",
    links: [
      { label: "Login", to: "/login" },
      { label: "Create Account", to: "/signup" },
      { label: "Changelog", to: "/changelog" },
      { label: "Sitemap", to: "/sitemap" },
      { label: "Advertise", to: "/advertise" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact Us", to: "/contact" },
      { label: "Terms of Use", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Data Disclaimer", to: "/disclaimer" },
      { label: "Affiliate Program", to: "/affiliates" },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: Facebook, url: "https://facebook.com/hedgefun", label: "Facebook" },
  { icon: Twitter, url: "https://twitter.com/hedgefun", label: "Twitter" },
  { icon: Instagram, url: "https://instagram.com/hedgefun", label: "Instagram" },
  { icon: Linkedin, url: "https://linkedin.com/company/hedgefun", label: "LinkedIn" },
  { icon: Youtube, url: "https://youtube.com/@hedgefun", label: "YouTube" },
];

export function Footer() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");

  return (
    <footer className="bg-footer-bg text-footer-text w-full">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Link Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {LINK_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-semibold tracking-wider text-footer-text/70 mb-3">
                {section.title}
              </h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <button
                      onClick={() => navigate(link.to)}
                      className="text-sm text-footer-text hover:text-white transition-colors"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Brand + Newsletter row */}
        <div className="grid md:grid-cols-2 gap-8 pb-8 border-b border-white/10">
          {/* Brand block */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-md bg-accent-blue flex items-center justify-center">
                <span className="text-sm font-bold text-white">HF</span>
              </div>
              <span className="font-display text-lg text-white font-bold">HedgeFun</span>
            </div>
            <p className="text-sm text-footer-text mb-2">Your edge in every market.</p>
            <p className="text-xs text-footer-text/60 leading-relaxed">
              1631 Del Prado Blvd S. #1124, Cape Coral, FL 33990
            </p>
            <p className="text-xs text-footer-text/60">
              Email: info@hedgefun.fun
            </p>
          </div>

          {/* Newsletter */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-footer-text/70 mb-1">
              MARKET NEWSLETTER
            </p>
            <p className="text-sm text-footer-text mb-3">
              Daily market news in bullet point format.
            </p>
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 bg-white text-foreground border-0"
              />
              <Button className="w-full bg-accent-blue hover:bg-accent-blue-hover text-white h-10">
                Subscribe
              </Button>
            </div>
          </div>
        </div>

        {/* Social + Theme row */}
        <div className="flex items-center justify-between py-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 rounded-full flex items-center justify-center text-white transition-colors"
                style={{ background: "rgba(255,255,255,0.08)" }}
                aria-label={social.label}
              >
                <social.icon className="h-4 w-4" />
              </a>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 text-xs text-footer-text rounded-full px-3 py-1.5"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Sun className="h-3.5 w-3.5" />
            <span>{theme === "light" ? "Light" : "Dark"}</span>
            <Moon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-6 text-xs text-footer-text/50">
          <span>© 2026 HedgeFun.fun. All rights reserved.</span>
          <button
            onClick={() => navigate("/privacy")}
            className="hover:text-footer-text transition-colors"
          >
            Do Not Sell or Share My Information
          </button>
        </div>
      </div>
    </footer>
  );
}
