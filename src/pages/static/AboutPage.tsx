import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { AdBanner } from "@/components/layout/AdBanner";
import { Shield, BarChart3, Brain, Users } from "lucide-react";

const TEAM = [
  {
    name: "Carlos A. Acosta",
    role: "Senior Analyst & Founder",
    bio: "U.S. Army veteran, full-stack developer, and data analyst with over a decade of experience building algorithmic trading systems and financial data pipelines. Carlos founded HedgeFun to democratize institutional-grade market intelligence for everyday investors.",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&crop=face",
  },
  {
    name: "Sofia Sky Acosta",
    role: "Junior Research Analyst",
    bio: "Research assistant specializing in data quality assurance, earnings calendar verification, and IPO pipeline tracking. Sofia supports the editorial and data teams to ensure accuracy across all published datasets.",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face",
  },
];

const PILLARS = [
  {
    icon: Brain,
    title: "Socratic AI Agents",
    desc: "McKinsey-style reasoning agents that challenge assumptions and surface non-obvious insights from raw market data.",
  },
  {
    icon: BarChart3,
    title: "Institutional-Grade Data",
    desc: "Real-time and delayed feeds from Polygon.io, SEC EDGAR, and proprietary pipelines — the same sources used by hedge funds.",
  },
  {
    icon: Shield,
    title: "Transparency First",
    desc: "Every AI output includes methodology disclosure. We never hide behind black-box scores or pay-to-play ratings.",
  },
  {
    icon: Users,
    title: "Built for Retail Traders",
    desc: "Professional tools without the six-figure Bloomberg terminal price tag. Free tier included, Pro for power users.",
  },
];

export default function AboutPage() {
  useEffect(() => {
    document.title = "About HedgeFun | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-[1000px] mx-auto px-6 py-12">
        {/* Hero */}
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
          About HedgeFun
        </h1>

        {/* Hero image */}
        <div className="rounded-lg overflow-hidden mb-10">
          <img
            src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=400&fit=crop"
            alt="Modern financial trading desk with multiple monitors displaying market charts"
            className="w-full h-[240px] sm:h-[320px] object-cover"
            loading="lazy"
          />
        </div>

        {/* Mission Statement */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">Our Mission</h2>
          <div className="text-base leading-[1.8] text-foreground space-y-4">
            <p>
              HedgeFun exists to bridge the gap between <strong>institutional-grade algorithmic analysis</strong>{" "}
              and the everyday retail trader. For decades, sophisticated quantitative tools, real-time data feeds,
              and AI-driven research were locked behind six-figure terminal subscriptions and hedge fund paywalls.
              We believe that access to high-quality financial intelligence is not a luxury — it is a necessity for
              informed participation in modern capital markets.
            </p>
            <p>
              Our platform leverages <strong>McKinsey-style Socratic AI agents</strong> — reasoning systems that
              don't just summarize data, but actively challenge assumptions, stress-test theses, and surface
              non-obvious risk factors that traditional screeners miss. Combined with real-time market data from
              Polygon.io, SEC filings, and proprietary analytical pipelines, HedgeFun delivers the depth of a
              professional research desk in an interface designed for clarity and speed.
            </p>
            <p>
              Whether you're tracking pre-market movers, screening for undervalued small-caps, analyzing earnings
              surprises, or evaluating IPO filings, HedgeFun provides the tools and context you need to make
              better-informed decisions — while always reminding you that no tool replaces independent judgment and
              professional financial counsel.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-foreground mb-6">What Sets Us Apart</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PILLARS.map((p) => (
              <Card key={p.title} className="border border-border">
                <CardContent className="p-5 flex gap-4 items-start">
                  <div className="shrink-0 mt-1 rounded-md bg-primary/10 p-2">
                    <p.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">{p.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-foreground mb-6">Our Team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {TEAM.map((member) => (
              <Card key={member.name} className="border border-border overflow-hidden">
                <div className="flex flex-col items-center pt-6 pb-2">
                  <img
                    src={member.image}
                    alt={`${member.name}, ${member.role} at HedgeFun`}
                    className="w-28 h-28 rounded-full object-cover border-2 border-border"
                    loading="lazy"
                  />
                </div>
                <CardContent className="text-center px-6 pb-6">
                  <p className="font-bold text-foreground text-lg">{member.name}</p>
                  <p className="text-sm text-primary font-medium mb-3">{member.role}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Office image */}
        <div className="rounded-lg overflow-hidden mb-10">
          <img
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=400&fit=crop"
            alt="Professional office workspace with natural lighting"
            className="w-full h-[200px] sm:h-[280px] object-cover"
            loading="lazy"
          />
        </div>

        {/* What We Offer */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-foreground mb-4">What We Offer</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground leading-relaxed">
            <li>Real-time stock and ETF data powered by Polygon.io</li>
            <li>Comprehensive stock screener with 297+ filters</li>
            <li>IPO calendar, statistics, and screener</li>
            <li>Market movers: gainers, losers, most active, premarket, and after-hours</li>
            <li>Technical charting with drawing tools and indicators</li>
            <li>AI-powered Socratic research agents for earnings and sentiment analysis</li>
            <li>Daily market newsletter delivered every morning before the open</li>
            <li>HedgeFun Pro for unlimited access to all data and tools</li>
          </ul>
        </section>

        {/* Contact CTA */}
        <section className="border-t border-border pt-6">
          <h2 className="text-xl font-bold text-foreground mb-3">Get in Touch</h2>
          <p className="text-foreground leading-relaxed">
            For inquiries, partnerships, or press requests, visit our{" "}
            <Link to="/contact" className="text-primary hover:underline">Contact Us</Link>{" "}
            page or email us at{" "}
            <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a>.
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            HedgeFun · 1631 Del Prado Blvd S. #1124 · Cape Coral, FL 33990
          </p>
        </section>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
