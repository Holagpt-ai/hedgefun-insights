import { useEffect } from "react";


const SECTIONS = [
  {
    title: "Acceptance of Terms",
    body: "By accessing HedgeFun, you agree to these terms. If you do not agree, do not use the site.",
  },
  {
    title: "Use of Service",
    body: "HedgeFun provides financial data for informational purposes only. You may not use the service for unlawful purposes, scrape data, or attempt to gain unauthorized access.",
  },
  {
    title: "Financial Disclaimer",
    body: "Content on HedgeFun is for informational purposes only and does not constitute financial, investment, or trading advice. Always consult a qualified financial advisor before making investment decisions.",
  },
  {
    title: "Account Responsibilities",
    body: "You are responsible for maintaining the security of your account credentials. Notify us immediately of any unauthorized use.",
  },
  {
    title: "Intellectual Property",
    body: "All content, design, and data on HedgeFun is proprietary. You may not reproduce or redistribute any content without written permission.",
  },
  {
    title: "Limitation of Liability",
    body: "HedgeFun is not liable for any investment losses, data inaccuracies, or service interruptions.",
  },
  {
    title: "Changes to Terms",
    body: "We reserve the right to modify these terms at any time. Continued use of the site constitutes acceptance of updated terms.",
  },
  {
    title: "Contact",
    body: "Questions about these terms? Email info@hedgefun.fun.",
  },
];

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Use | HedgeFun";
  }, []);

  return (
    <>
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Terms of Use
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
    </>
  );
}
