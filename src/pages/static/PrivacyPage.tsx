import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-[800px] mx-auto px-6 py-12">
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-4">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 8, 2026</p>

        <div className="text-base leading-[1.8] text-foreground space-y-6">
          {/* ── 1. Introduction ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">1. Introduction</h2>
            <p>
              HedgeFun ("<strong>hedgefun.fun</strong>," "we," "us," or "our") operates a financial data
              aggregation, algorithmic analysis, and educational technology platform. This Privacy Policy
              explains how we collect, use, store, share, and protect your personal information when you
              access our website, use our services, interact with the <strong>HedgeFun AI Consultant</strong>
              chatbot, or subscribe to our newsletter and premium plans. By using HedgeFun, you consent to
              the data practices described in this policy. If you do not agree, please discontinue use of
              the platform immediately.
            </p>
          </section>

          {/* ── 2. Information We Collect ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">2. Information We Collect</h2>
            <p className="mb-3">
              We collect information in several ways depending on how you interact with the platform:
            </p>

            <h3 className="font-semibold mb-1">2.1 Information You Provide Directly</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Account Data:</strong> When you create an account, we collect your email address,
                display name, and authentication credentials. If you sign up via Google OAuth, we receive
                your name, email address, and profile photo from Google.
              </li>
              <li>
                <strong>Payment Information:</strong> When you subscribe to HedgeFun Pro, payment details
                (credit card number, billing address) are collected and processed exclusively by our
                third-party payment processor, <strong>Stripe, Inc.</strong> We do not store your full
                credit card number on our servers.
              </li>
              <li>
                <strong>Contact Submissions:</strong> If you contact us via the Contact Us form, we collect
                your name, email, subject, and message content.
              </li>
              <li>
                <strong>Newsletter Subscription:</strong> We collect your email address when you subscribe
                to our daily market newsletter.
              </li>
              <li>
                <strong>Affiliate Applications:</strong> If you apply to our affiliate program, we collect
                your name, email, website URL, audience size, and promotion plan.
              </li>
            </ul>

            <h3 className="font-semibold mb-1">2.2 AI Consultant Chat Data</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Chat Prompts &amp; Interactions:</strong> When you interact with the
                <strong> HedgeFun AI Consultant</strong>, we collect and store the full text of your
                prompts, questions, and the AI-generated responses. This data is associated with your
                session token (and your user ID if you are logged in).
              </li>
              <li>
                <strong>Session Metadata:</strong> We track session creation time, last activity time, and
                total tokens consumed per session for rate-limiting and usage analytics.
              </li>
              <li>
                <strong>Purpose:</strong> Chat data is used to provide the conversational AI service,
                enforce usage limits, improve response quality, and monitor for abuse. Chat history may be
                reviewed internally for quality assurance but is never sold to third parties.
              </li>
            </ul>

            <h3 className="font-semibold mb-1">2.3 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Usage Data:</strong> Pages visited, features used, search queries, watchlist
                activity, screener filters, and time spent on each page.
              </li>
              <li>
                <strong>Device &amp; Browser Information:</strong> IP address, browser type, operating
                system, device type, screen resolution, and referring URL.
              </li>
              <li>
                <strong>Log Data:</strong> Server logs that record access times, error codes, and API
                request metadata.
              </li>
            </ul>
          </section>

          {/* ── 3. Cookies, Google AdSense & Advertising ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">3. Cookies, Google AdSense &amp; Advertising</h2>

            <h3 className="font-semibold mb-1">3.1 Cookies We Use</h3>
            <p className="mb-3">
              Cookies are small text files stored on your device. We use the following categories of cookies:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Essential Cookies:</strong> Required for authentication, session management, and
                security. These cannot be disabled without breaking core functionality.
              </li>
              <li>
                <strong>Analytics Cookies:</strong> We use <strong>Google Analytics</strong> to collect
                aggregated usage statistics. Google Analytics uses cookies to identify unique visitors
                without personally identifying them.
              </li>
              <li>
                <strong>Advertising Cookies:</strong> We use <strong>Google AdSense</strong> to display
                advertisements on our platform. Google AdSense uses cookies — including the
                <strong> DoubleClick cookie</strong> — to serve ads based on your prior visits to this
                and other websites. This is known as <strong>interest-based advertising</strong>.
              </li>
            </ul>

            <h3 className="font-semibold mb-1">3.2 Google AdSense &amp; Interest-Based Advertising</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                Third-party vendors, including Google, use cookies to serve ads based on your prior visits
                to HedgeFun and other websites on the internet.
              </li>
              <li>
                Google's use of the DoubleClick cookie enables it and its partners to serve ads based on
                your visit to HedgeFun and/or other sites on the internet.
              </li>
              <li>
                You may opt out of personalized advertising by visiting{" "}
                <a href="https://www.google.com/settings/ads" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Google Ads Settings
                </a>.
              </li>
              <li>
                Alternatively, you may opt out of third-party vendor cookies for personalized advertising
                by visiting{" "}
                <a href="https://www.aboutads.info/choices/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  www.aboutads.info/choices
                </a>.
              </li>
            </ul>

            <h3 className="font-semibold mb-1">3.3 Managing Cookies</h3>
            <p>
              You can control cookies through your browser settings. Most browsers allow you to block or
              delete cookies. However, disabling cookies may impair the functionality of certain features
              on HedgeFun, including authentication and personalized settings.
            </p>
          </section>

          {/* ── 4. How We Use Your Information ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">4. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, operate, and maintain the HedgeFun platform and its features.</li>
              <li>To process and manage your HedgeFun Pro subscription.</li>
              <li>To deliver the daily market newsletter to subscribers.</li>
              <li>To power the HedgeFun AI Consultant chatbot and enforce per-user rate limits.</li>
              <li>To analyze usage patterns and improve our algorithms, user interface, and content.</li>
              <li>To display relevant advertisements via Google AdSense.</li>
              <li>To detect, prevent, and address fraud, abuse, and security incidents.</li>
              <li>To comply with applicable legal obligations.</li>
            </ul>
          </section>

          {/* ── 5. Third-Party Data Processors & Services ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">5. Third-Party Data Processors &amp; Services</h2>
            <p className="mb-3">
              We share or transmit data to the following third-party service providers as necessary to
              operate the platform:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Polygon.io:</strong> Financial market data provider. We retrieve stock prices,
                historical data, analyst ratings, IPO calendars, and related financial information from
                Polygon.io's APIs. Polygon.io does not receive your personal data.
              </li>
              <li>
                <strong>Large Language Model (LLM) Providers:</strong> Chat prompts and contextual data
                submitted to the HedgeFun AI Consultant may be transmitted to third-party LLM
                infrastructure providers (such as Google Gemini or OpenAI) for processing. These
                providers process data per their own privacy policies. We do not send your email address,
                payment details, or other personally identifiable information to LLM providers — only the
                chat prompt content and relevant financial context.
              </li>
              <li>
                <strong>Stripe, Inc.:</strong> Payment processing for HedgeFun Pro subscriptions. Stripe
                collects and processes payment information pursuant to its own{" "}
                <a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Google Analytics:</strong> Website usage analytics. Data is collected in
                aggregated, anonymized form.
              </li>
              <li>
                <strong>Google AdSense:</strong> Advertising display and interest-based ad targeting as
                described in Section 3.
              </li>
            </ul>
          </section>

          {/* ── 6. Data Retention ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">6. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Data:</strong> Retained for the duration of your account. Deleted within
                30 days of account deletion request.
              </li>
              <li>
                <strong>AI Chat History:</strong> Chat sessions are retained for up to 90 days for
                service quality and abuse monitoring purposes, then automatically purged. You may request
                early deletion at any time.
              </li>
              <li>
                <strong>Payment Data:</strong> Transaction records are retained as required by applicable
                tax and financial reporting laws (typically 7 years).
              </li>
              <li>
                <strong>Analytics Data:</strong> Aggregated, anonymized usage data may be retained
                indefinitely for trend analysis.
              </li>
            </ul>
          </section>

          {/* ── 7. Your Rights (GDPR / CCPA) ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">7. Your Rights Under GDPR &amp; CCPA</h2>
            <p className="mb-3">
              Depending on your jurisdiction, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Right of Access:</strong> You may request a copy of the personal data we hold
                about you, including your chat history with the AI Consultant.
              </li>
              <li>
                <strong>Right to Rectification:</strong> You may request correction of inaccurate or
                incomplete personal data.
              </li>
              <li>
                <strong>Right to Erasure:</strong> You may request deletion of your account, personal
                data, and AI chat history. We will process such requests within 30 days.
              </li>
              <li>
                <strong>Right to Restrict Processing:</strong> You may request that we limit the
                processing of your personal data under certain circumstances.
              </li>
              <li>
                <strong>Right to Data Portability:</strong> You may request a machine-readable export of
                your personal data.
              </li>
              <li>
                <strong>Right to Object:</strong> You may object to the processing of your personal data
                for direct marketing or profiling purposes.
              </li>
              <li>
                <strong>Do Not Sell (CCPA):</strong> We do not sell your personal information to third
                parties. California residents may exercise their CCPA rights by contacting us.
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>.
              We will respond within 30 days.
            </p>
          </section>

          {/* ── 8. Data Security ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">8. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal data, including
              TLS encryption for all data in transit, encrypted storage for sensitive fields, role-based
              access controls, and regular security audits. However, no method of electronic storage or
              transmission is 100% secure, and we cannot guarantee absolute security. You are responsible
              for maintaining the confidentiality of your account credentials.
            </p>
          </section>

          {/* ── 9. Children's Privacy ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">9. Children's Privacy</h2>
            <p>
              HedgeFun is not directed to individuals under the age of 18. We do not knowingly collect
              personal information from children. If we become aware that a child under 18 has provided
              us with personal data, we will take steps to delete such information promptly.
            </p>
          </section>

          {/* ── 10. International Data Transfers ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">10. International Data Transfers</h2>
            <p>
              Your data may be transferred to and processed in countries other than your country of
              residence, including the United States, where our servers and third-party service providers
              are located. By using HedgeFun, you consent to the transfer of your data to these
              jurisdictions, which may have different data protection laws than your home country.
            </p>
          </section>

          {/* ── 11. Changes to This Policy ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will
              update the "Last updated" date at the top of this page and, where required by law, notify
              you via email or a prominent notice on the platform. Your continued use of HedgeFun after
              any changes constitutes acceptance of the revised policy.
            </p>
          </section>

          {/* ── 12. Contact ── */}
          <section className="border-t border-border pt-6 mt-8">
            <h2 className="text-[1.125rem] font-bold mb-2">Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or wish to exercise your data rights,
              please contact us at{" "}
              <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>{" "}
              or write to us at: 1631 Del Prado Blvd, Cape Coral, FL 33990.
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
