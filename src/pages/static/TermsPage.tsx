import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";
import { Link } from "react-router-dom";

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-[800px] mx-auto px-6 py-12">
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-4">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 8, 2026</p>

        <div className="text-base leading-[1.8] text-foreground space-y-6">
          {/* ── 1. Acceptance of Terms ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing, browsing, or using HedgeFun ("<strong>hedgefun.fun</strong>," "we," "us," or
              "our"), you acknowledge that you have read, understood, and agree to be bound by these Terms
              of Service ("Terms"), our{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, and our{" "}
              <Link to="/disclaimer" className="text-primary hover:underline">Data Disclaimer &amp; Risk Disclosure</Link>.
              If you do not agree to these Terms, you must not use the platform. We reserve the right to
              modify these Terms at any time. Continued use after modifications constitutes acceptance of
              the updated Terms.
            </p>
          </section>

          {/* ── 2. Description of Service ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">2. Description of Service</h2>
            <p>
              HedgeFun is an independent financial data aggregation and educational technology platform.
              We provide stock market data, charts, screeners, analyst ratings, IPO calendars, earnings
              data, AI-powered market analysis, and related tools. The platform includes a free tier and
              a premium subscription tier ("HedgeFun Pro"). All data and analysis are delivered for
              <strong> informational and educational purposes only</strong>.
            </p>
          </section>

          {/* ── 3. Service Limitations — NOT Financial Advice ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">3. Service Limitations — Not Financial Advice</h2>
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-3">
              <p className="font-semibold text-destructive mb-2">⚠ IMPORTANT NOTICE</p>
              <p>
                HedgeFun provides <strong>algorithmic and AI-driven data analysis</strong>. We are
                <strong> NOT</strong> providing personalized, licensed financial advice. HedgeFun is not a
                registered broker-dealer, investment advisor, Commodity Trading Advisor (CTA), Registered
                Investment Advisor (RIA), or financial planner with the SEC, FINRA, CFTC, or any state
                securities regulatory authority.
              </p>
            </div>
            <p>
              No content on HedgeFun — including AI-generated summaries, analyst consensus data, screener
              results, earnings analysis, or chatbot interactions — constitutes a recommendation,
              endorsement, or solicitation to buy, sell, or hold any security, option, or financial
              instrument. All algorithmic outputs, sentiment scores, and AI commentary are generated
              automatically and do not account for your individual financial situation, risk tolerance,
              investment objectives, or time horizon. You are solely responsible for your own investment
              decisions and should consult a qualified, licensed financial advisor before making any
              investment.
            </p>
          </section>

          {/* ── 4. Liability Waiver & Indemnification ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">4. Limitation of Liability &amp; Indemnification</h2>

            <h3 className="font-semibold mb-1">4.1 Limitation of Liability</h3>
            <p className="mb-4">
              To the maximum extent permitted by applicable law, HedgeFun, its owners, officers,
              employees, affiliates, contractors, and data providers shall <strong>not be liable</strong>{" "}
              for any direct, indirect, incidental, special, consequential, or punitive damages —
              including but not limited to loss of profits, loss of capital, trading losses, loss of data,
              or business interruption — arising out of or in connection with your use of, or inability to
              use, this platform or any information, data, AI-generated content, or analysis contained
              herein, even if HedgeFun has been advised of the possibility of such damages.
            </p>

            <h3 className="font-semibold mb-1">4.2 Indemnification</h3>
            <p>
              You agree to indemnify, defend, and hold harmless HedgeFun, its founder Carlos A. Acosta,
              its team members, affiliates, licensors, and service providers from and against any and all
              claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including
              reasonable attorneys' fees) arising out of or relating to: (a) your use of the platform;
              (b) any trading or investment decisions you make based on data, analysis, AI commentary, or
              any other content obtained from HedgeFun; (c) your violation of these Terms; (d) your
              violation of any applicable law or regulation; or (e) any financial losses you incur from
              trading options, credit spreads, equities, ETFs, or any other financial instruments after
              viewing, reading, or interacting with content on this platform.
            </p>
          </section>

          {/* ── 5. Account Responsibilities ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">5. Account Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                You must provide accurate and complete information when creating an account.
              </li>
              <li>
                You are solely responsible for maintaining the confidentiality of your login credentials.
              </li>
              <li>
                You must notify us immediately at{" "}
                <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>{" "}
                of any unauthorized access to or use of your account.
              </li>
              <li>
                You are responsible for all activity that occurs under your account, whether or not
                authorized by you.
              </li>
              <li>
                You must be at least 18 years of age to create an account and use the platform.
              </li>
            </ul>
          </section>

          {/* ── 6. HedgeFun Pro Subscription ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">6. HedgeFun Pro — Subscription Terms</h2>

            <h3 className="font-semibold mb-1">6.1 Billing &amp; Renewal</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                HedgeFun Pro is offered as a recurring subscription billed on a monthly or annual basis
                through our payment processor, <strong>Stripe</strong>.
              </li>
              <li>
                Subscriptions automatically renew at the end of each billing period unless cancelled
                before the renewal date.
              </li>
              <li>
                All fees are charged in U.S. dollars. Prices are subject to change with 30 days' notice.
              </li>
              <li>
                <strong>No refunds</strong> will be issued for partial billing periods or unused portions
                of the subscription term unless required by applicable law.
              </li>
            </ul>

            <h3 className="font-semibold mb-1">6.2 Account Sharing</h3>
            <p className="mb-4">
              HedgeFun Pro subscriptions are <strong>single-user licenses</strong>. Each subscription is
              intended for use by the individual who purchased it. You may not share, transfer, or
              sublicense your account credentials to any other person or entity. We reserve the right to
              monitor for abnormal login patterns and terminate accounts that appear to be sharing access.
            </p>

            <h3 className="font-semibold mb-1">6.3 Termination &amp; Cancellation</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                You may cancel your subscription at any time through your account settings or by
                contacting us. Cancellation takes effect at the end of the current billing period.
              </li>
              <li>
                We reserve the right to suspend or terminate your account immediately, without prior
                notice or liability, if you violate these Terms, engage in abusive behavior, or misuse
                the platform.
              </li>
              <li>
                Upon termination, your access to Pro features will cease, but your free-tier account and
                associated data will remain accessible unless you request deletion.
              </li>
            </ul>
          </section>

          {/* ── 7. Acceptable Use ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">7. Acceptable Use Policy</h2>
            <p className="mb-3">
              You agree that you will <strong>NOT</strong> use HedgeFun to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Scrape, crawl, or harvest</strong> any data, content, or information from the
                platform using automated bots, scripts, spiders, or any other automated means without
                our express written consent.
              </li>
              <li>
                <strong>Reverse-engineer, decompile, or disassemble</strong> any aspect of the HedgeFun
                platform, including but not limited to our proprietary AI algorithms, Socratic reasoning
                agents, scoring models, or analytical pipelines.
              </li>
              <li>
                <strong>Redistribute, republish, or commercially exploit</strong> any data, charts,
                analysis, or AI-generated content from HedgeFun without written permission.
              </li>
              <li>
                <strong>Engage in market manipulation</strong>, including but not limited to using
                platform data to coordinate pump-and-dump schemes, spoofing, layering, or any activity
                that violates SEC, FINRA, or CFTC regulations.
              </li>
              <li>
                <strong>Circumvent rate limits</strong> or security measures, including attempting to
                bypass AI Consultant usage caps, authentication mechanisms, or access controls.
              </li>
              <li>
                <strong>Use the platform for any unlawful purpose</strong> or in violation of any
                applicable local, state, national, or international law.
              </li>
              <li>
                <strong>Transmit malicious code</strong>, including viruses, worms, trojans, or any other
                harmful software through the platform.
              </li>
              <li>
                <strong>Impersonate</strong> any person or entity, or falsely state or misrepresent your
                affiliation with a person or entity.
              </li>
            </ul>
          </section>

          {/* ── 8. Intellectual Property ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">8. Intellectual Property</h2>
            <p>
              All content, design, code, data visualizations, algorithms, AI models, branding, logos, and
              documentation on HedgeFun are the proprietary intellectual property of HedgeFun and its
              licensors. You are granted a limited, non-exclusive, non-transferable, revocable license to
              access and use the platform for personal, non-commercial purposes in accordance with these
              Terms. You may not reproduce, distribute, modify, create derivative works from, publicly
              display, or commercially exploit any content from HedgeFun without our prior written consent.
            </p>
          </section>

          {/* ── 9. AI-Generated Content Disclaimer ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">9. AI-Generated Content</h2>
            <p>
              HedgeFun utilizes artificial intelligence, including large language models, to generate
              analytical summaries, market commentary, and conversational responses via the AI Consultant.
              AI-generated content may contain errors, inaccuracies, or "hallucinations." Such content
              is provided "as is" without any warranty of accuracy, completeness, or reliability. You
              must independently verify all AI-generated information before making any decisions based
              on it. HedgeFun disclaims all liability for any actions taken in reliance on AI-generated
              content.
            </p>
          </section>

          {/* ── 10. Third-Party Links & Data ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">10. Third-Party Links &amp; Data</h2>
            <p>
              HedgeFun may contain links to third-party websites and integrates data from third-party
              providers including Polygon.io, SEC EDGAR, Google Analytics, and Google AdSense. We are not
              responsible for the content, accuracy, privacy practices, or availability of any third-party
              services. Your interaction with third-party services is governed by their respective terms
              and privacy policies.
            </p>
          </section>

          {/* ── 11. Disclaimer of Warranties ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">11. Disclaimer of Warranties</h2>
            <p>
              HedgeFun is provided on an "<strong>AS IS</strong>" and "<strong>AS AVAILABLE</strong>"
              basis without warranties of any kind, either express or implied, including but not limited
              to implied warranties of merchantability, fitness for a particular purpose, accuracy, and
              non-infringement. We do not warrant that the platform will be uninterrupted, error-free,
              secure, or free of viruses or other harmful components.
            </p>
          </section>

          {/* ── 12. Governing Law ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">12. Governing Law &amp; Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of
              Florida, United States, without regard to its conflict of law provisions. Any disputes
              arising under or in connection with these Terms shall be resolved through binding
              arbitration in Lee County, Florida, in accordance with the rules of the American
              Arbitration Association. You waive any right to a jury trial or to participate in a class
              action lawsuit.
            </p>
          </section>

          {/* ── 13. Severability ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">13. Severability</h2>
            <p>
              If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court
              of competent jurisdiction, the remaining provisions shall continue in full force and effect.
              The invalid provision shall be modified to the minimum extent necessary to make it valid and
              enforceable while preserving its original intent.
            </p>
          </section>

          {/* ── 14. Contact ── */}
          <section className="border-t border-border pt-6 mt-8">
            <h2 className="text-[1.125rem] font-bold mb-2">Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at{" "}
              <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>{" "}
              or write to us at: 1631 Del Prado Blvd, Cape Coral, FL 33990. You may also visit our{" "}
              <Link to="/contact" className="text-primary hover:underline">Contact Us</Link> page.
            </p>
          </section>
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
