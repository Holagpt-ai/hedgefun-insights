import { useEffect } from "react";
import { Footer } from "@/components/layout/Footer";

const SECTIONS = [
  {
    title: "Information We Collect",
    body: "Email address (on signup/newsletter), usage data (pages visited, features used), device and browser info.",
  },
  {
    title: "How We Use Your Information",
    body: "To provide and improve the service, send the daily market newsletter (if subscribed), send account-related emails, and analyze usage patterns.",
  },
  {
    title: "Data Storage",
    body: "User data is stored securely using industry-standard infrastructure. We do not sell, rent, or share your personal information with third parties for marketing purposes.",
  },
  {
    title: "Cookies",
    body: "We use cookies for authentication and analytics (Google Analytics). You can disable cookies in your browser settings.",
  },
  {
    title: "Third-Party Services",
    body: "We use Polygon.io (market data), Stripe (payments), and Google Analytics (usage analytics). Each has their own privacy policies.",
  },
  {
    title: "Your Rights",
    body: "You may request deletion of your account and data at any time by emailing info@hedgefun.fun.",
  },
  {
    title: "Do Not Sell",
    body: "We do not sell personal information. California residents may exercise CCPA rights by contacting us.",
  },
  {
    title: "Contact",
    body: "Privacy questions: info@hedgefun.fun.",
  },
];

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | HedgeFun";
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: March 12, 2026</p>

      <div className="text-base leading-[1.6] text-foreground">
        {SECTIONS.map((s, i) => (
          <div key={i} className="mb-6">
            <h2 className="text-[1.125rem] font-bold mb-2">{s.title}</h2>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

    </div>
    <Footer />
  );
}
