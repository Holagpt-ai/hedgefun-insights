import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ARTICLES } from "./ArticlesPage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePageSeo } from "@/hooks/usePageSeo";

/* ── Full Article Bodies ──────────────────────────── */
const ARTICLE_BODIES: Record<string, string[]> = {
  "starlink-ipo-what-investors-need-to-know": [
    `There's a certain electricity in the air whenever a company like Starlink begins telegraphing its intention to go public. I've been doing this long enough — studying businesses, meeting management teams, reading through prospectuses at two in the morning — to tell you that opportunities like this don't come along every quarter. Starlink, SpaceX's satellite internet division, sits at the intersection of infrastructure, technology, and an enormous unmet global need. If you've followed Elon Musk's playbook at Tesla, you know the pattern: relentless execution against impossible timelines, critics proven wrong in sequence, and ultimately, massive value creation for early believers.`,

    `Let's talk about the business itself. Starlink has deployed over 6,400 satellites as of late 2025, providing broadband coverage to more than 4 million subscribers across 100+ countries. Revenue is estimated to have crossed $11 billion in 2025, up from $6.6 billion the prior year. The gross margins on satellite internet are compelling — once the constellation is deployed, the marginal cost of adding a subscriber is essentially the terminal hardware and a software activation. SpaceX's reusable Falcon 9 rockets have slashed launch costs to roughly $2,700 per kilogram, compared to $54,500 on the Space Shuttle era. That cost advantage is the moat. No competitor — not Amazon's Project Kuiper, not OneWeb — can match the launch cadence or the cost structure because no one else owns their own rocket.`,

    `Now here's where the investor thinking gets interesting. The rumored valuation for a Starlink IPO sits between $150 billion and $200 billion. That sounds like a lot, but consider the total addressable market: there are roughly 3 billion people on Earth with either no internet access or unreliable connectivity. Enterprise applications — maritime shipping, aviation Wi-Fi, military communications, oil rig connectivity — represent another multi-billion dollar vertical that's barely been penetrated. Morgan Stanley's research team has modeled Starlink's serviceable addressable market at over $100 billion annually by 2030. At a 25% market share and 40% operating margins, you're looking at $10 billion in operating income on $25 billion in revenue. Apply a 20x multiple to that — reasonable for a high-growth infrastructure monopoly — and you're at $200 billion.`,

    `What I want investors to understand is the risk side too, because every great investment thesis has risks that need to be underwritten. First, regulatory risk is real. Starlink needs spectrum licenses and landing rights in every country it operates. Some nations — India, for example — have been slow to grant approvals due to national security concerns around satellite data sovereignty. Second, there's technology risk: satellite hardware degrades in orbit, and SpaceX needs to continuously launch replacement satellites. The maintenance capex is not trivial — roughly $2 billion per year at current scale. Third, competition is coming. Amazon has committed over $10 billion to Project Kuiper and plans to have 3,236 satellites in orbit by 2029.`,

    `My personal framework for evaluating pre-IPO opportunities comes down to three questions: Is the management team proven? Is the market large enough to support the valuation? And does the company have a structural cost advantage that's durable? For Starlink, the answer to all three is yes. Musk has built and scaled three multi-billion-dollar companies. The market is measured in tens of billions. And the SpaceX launch cost advantage is at least five years ahead of the nearest competitor. The practical question for retail investors is allocation. In a hot IPO, institutions will get the lion's share of the initial offering. If the stock pops 30–50% on day one — which I'd expect given the hype — you need to decide whether you're buying the pop or waiting for the first earnings report to establish a more informed position. My preference? Wait for the first 10-Q. The real opportunity is in the years ahead, not the first trading session.`,

    `I'd also flag one more thing that most analysts are overlooking: Starlink's potential in the direct-to-device market. The company has already signed a partnership with T-Mobile to provide satellite-to-cellphone connectivity for dead zones. If that technology scales — and early tests suggest it will — Starlink could become a critical backend infrastructure provider for every major telecom carrier on the planet. That's not priced into any model I've seen. The bottom line is this: Starlink is a generational infrastructure asset disguised as a tech IPO. Treat it with the seriousness it deserves. Do your homework on the S-1 when it drops, understand the unit economics, and size your position appropriately. The companies that connect the world tend to compound wealth for decades.`,
  ],

  "rising-oil-prices-whats-driving-the-surge": [
    `I've spent the better part of three decades studying commodity cycles, and I can tell you with certainty that oil remains the single most important commodity in the global economy. Everything — your food, your shipping costs, the plastics in your phone, the jet fuel that moves executives to board meetings — runs on crude. When oil moves, everything moves. And right now, oil is moving higher for reasons that are structural, not speculative. Brent crude has climbed from $72 per barrel in September 2025 to over $89 in early February 2026. That's a 24% move in five months, and the fundamentals suggest we're not done.`,

    `Let's start with supply. OPEC+ has been remarkably disciplined in this cycle. Saudi Arabia, the swing producer, has maintained voluntary production cuts of 1 million barrels per day since mid-2023. Russia, despite sanctions and shadow fleet complications, has actually reduced output as well — partly by choice, partly because aging Siberian fields are declining faster than new capacity can come online. Meanwhile, U.S. shale production, which everyone assumed would fill the gap, has plateaued. The Permian Basin — which produces about 40% of U.S. crude — is showing signs of maturation. Tier-1 drilling locations are being depleted, and new wells are showing lower initial production rates. Pioneer Natural Resources' internal data, now public through the ExxonMobil acquisition filings, showed that average well productivity declined 8% year-over-year in 2025.`,

    `On the demand side, the picture is equally bullish. China's post-COVID economic recovery was slower than expected in 2024, but industrial activity reaccelerated in late 2025 as fiscal stimulus kicked in. India, now the world's third-largest oil importer, continues to grow demand at 5–6% annually driven by a rising middle class and expanding vehicle fleet. And here's the factor that almost nobody is talking about: AI data centers. The explosive buildout of AI infrastructure across the United States and Europe is driving unprecedented electricity demand. Natural gas is the primary fuel for power generation in the U.S., and when natural gas prices rise, utilities switch to oil-fired generation at the margin. The feedback loop between AI infrastructure spending and energy demand is real and growing.`,

    `So who benefits? I look for companies with three characteristics: low-cost production, strong balance sheets, and disciplined capital return programs. ExxonMobil (XOM) sits at the top of my list. The Pioneer acquisition gave Exxon the single largest position in the Permian Basin, with breakeven costs below $35 per barrel. At $89 oil, Exxon is generating roughly $12 billion in quarterly free cash flow. They're buying back $20 billion in stock annually while maintaining a 3.4% dividend yield. That's the kind of capital allocation discipline that compounds wealth. Chevron (CVX) is another name I favor, particularly if the Hess acquisition closes and gives them a 30% stake in the massive Guyana Stabroek block — one of the most prolific offshore oil discoveries in the last 20 years.`,

    `For investors with a higher risk tolerance, I'd look at Canadian oil sands producers like Canadian Natural Resources (CNQ) and Suncor Energy (SU). These companies were left for dead during the ESG-driven divestment wave of 2020–2022, and their stocks still trade at single-digit price-to-earnings ratios despite generating enormous free cash flow. Canadian Natural, for example, has increased its dividend for 24 consecutive years — a track record that would make most S&P 500 companies jealous. The thesis here is simple: the world needs 100 million barrels of oil per day, demand is growing, supply is constrained, and the companies producing it are returning massive amounts of capital to shareholders.`,

    `I want to address the elephant in the room: the energy transition. Yes, electric vehicles are growing. Yes, renewables are expanding. But the timeline for displacing oil demand is measured in decades, not years. The International Energy Agency's own models show global oil demand remaining above 95 million barrels per day through 2035, even in their accelerated transition scenario. The practical reality is that oil is being underinvested at a time when demand is still growing. That's the setup for a prolonged period of higher prices, and the companies I've mentioned are the primary beneficiaries. Position accordingly, maintain discipline on entry prices, and let the cash flow compound. The oil trade isn't a sprint — it's a marathon with quarterly dividend checks along the way.`,
  ],

  "the-perfect-retracement-setup-a-trade-breakdown": [
    `I've taken thousands of trades over my career, and if there's one pattern I come back to again and again, it's the Fibonacci retracement. Not because it's magic — there's no magic in markets — but because it works for a simple reason: enough professional traders watch the same levels that they become self-fulfilling. When a stock pulls back to the 61.8% retracement of a strong impulse move, institutional algorithms, hedge fund quant desks, and experienced discretionary traders all see the same thing. That concentration of attention creates a cluster of buy orders at specific price points, and when those orders trigger, the stock bounces. Understanding this dynamic is the difference between gambling and trading with an edge.`,

    `Let me walk you through a real setup that occurred in January 2026 on NVIDIA (NVDA). The stock ran from $118.40 on December 12th to $142.90 on January 8th — a clean $24.50 impulse move driven by the CES keynote and renewed AI spending guidance. That's the kind of catalyst-driven move that creates textbook retracement opportunities. After the peak at $142.90, NVDA pulled back over nine trading sessions. The key Fibonacci levels on this move were: 38.2% retracement at $133.54, 50% at $130.65, and 61.8% at $127.76. I was watching the 61.8% level specifically because the pullback was orderly — decreasing volume on the way down, no panic selling, no negative news catalysts. That's the signature of profit-taking, not distribution.`,

    `On January 21st, NVDA touched $128.12 — within 36 cents of the 61.8% retracement. The stock printed a hammer candle on the daily chart with volume 15% above the 20-day average. That's what I call a "confirmation candle" — it tells you that buyers are stepping in at the Fibonacci level with conviction. The next morning, I entered a position at $129.40 with a stop-loss at $126.80 — just below the 61.8% level with a small cushion for noise. My target was a retest of the prior high at $142.90, giving me a risk-reward ratio of $2.60 risk to $13.50 reward, or roughly 5.2:1. Any time I can find a setup with better than 3:1 risk-reward and technical confirmation, I'm taking that trade.`,

    `Here's what happened next. NVDA consolidated between $128 and $131 for two days — that's normal. Fibonacci bounces rarely produce V-shaped reversals. They form bases. On January 24th, the stock broke above the 50% retracement at $130.65 on strong volume and never looked back. By February 3rd, NVDA was trading at $139.80. I moved my stop to breakeven ($129.40) once the stock cleared $135 — locking in a risk-free trade. On February 7th, NVDA hit $143.20, exceeding the prior high by 30 cents. I sold 75% of my position at $142.50 and let the remaining 25% run with a trailing stop. The final exit was at $146.80 on February 12th when the trailing stop triggered after a minor pullback.`,

    `Let me break down the math because it matters. On the initial 75% exit, the gain was $13.10 per share (from $129.40 to $142.50). On the trailing 25%, the gain was $17.40 per share (from $129.40 to $146.80). On a 1,000-share position, that's $9,825 on the first tranche and $4,350 on the second, for a total profit of $14,175 on $129,400 of capital at risk — an 11% return in three weeks. The maximum risk was $2,600 (1,000 shares × $2.60 stop distance). That's the power of asymmetric risk-reward combined with a high-probability setup. You don't need to be right 80% of the time. You need to be right 40% of the time with 5:1 risk-reward, and you'll build wealth consistently.`,

    `A few practical notes for traders looking to implement this. First, not every retracement is tradeable. You want to see the initial impulse move driven by a fundamental catalyst — earnings, product launch, analyst upgrade — not just random momentum. Second, the pullback should be orderly with declining volume. If volume increases on the pullback, that's distribution, and the Fibonacci levels are less likely to hold. Third, always wait for a confirmation candle at the level. Don't front-run. The confirmation candle — a hammer, bullish engulfing, or morning star — tells you that other participants see what you see and are acting on it. Finally, position sizing matters more than entry. I never risk more than 1% of my portfolio on any single setup, regardless of how "perfect" it looks. The market has a way of humbling even the best traders, and capital preservation is the foundation of longevity. Trade the setup, manage the risk, and let the math work in your favor over hundreds of trades.`,
  ],

  "ai-infrastructure-the-mega-scalers-building-the-future": [
    `We are in the middle of the largest infrastructure buildout since the transcontinental railroad, and most investors still don't fully grasp the scale of what's happening. In 2025, the four mega-scale cloud providers — Microsoft, Google, Amazon, and Meta — collectively spent approximately $230 billion on capital expenditures, the vast majority directed at AI data centers, custom silicon, and networking equipment. Microsoft alone guided to $80 billion in capex for fiscal year 2026. To put that in perspective, that's more than the entire GDP of Luxembourg. These aren't speculative bets. These companies are seeing real revenue from AI services, and they're doubling down because the demand curves are steeper than anything they've modeled.`,

    `Let me explain why this matters from an investor's perspective using a framework I call "picks and shovels plus." During the Gold Rush, the reliable money wasn't in panning for gold — it was in selling picks, shovels, and denim to the miners. The AI equivalent is the infrastructure layer: the chips, the servers, the power systems, the cooling technology, and the fiber optics that make AI possible. But here's where "plus" comes in — unlike the Gold Rush, we already know the miners are finding gold. Microsoft's Azure AI revenue grew 150% year-over-year in Q3 2025. Amazon Web Services reported that AI-related services crossed a $25 billion annualized run rate. Google Cloud's AI revenue tripled. The demand signal is unambiguous.`,

    `NVIDIA (NVDA) remains the dominant player in AI compute, with an estimated 85% market share in data center GPUs. The upcoming Blackwell Ultra architecture, expected in mid-2026, promises a 2.5x improvement in inference performance per watt — a critical metric because power consumption is the binding constraint on data center expansion. But I want to highlight some less obvious beneficiaries. Broadcom (AVGO) is quietly becoming one of the most important AI infrastructure companies through its custom ASIC business. Google's TPU, Meta's MTIA, and several undisclosed hyperscaler chips are designed and manufactured through Broadcom's semi-custom division. This business alone is expected to generate $12 billion in revenue in fiscal 2026, up from $4 billion just two years ago. The margins on custom silicon are exceptional because Broadcom provides the design expertise while the customer funds the manufacturing.`,

    `On the networking side, Arista Networks (ANET) is the clear winner. AI training clusters require ultra-low-latency, high-bandwidth switching fabric — and Arista's 800G Ethernet switches have become the industry standard. Every new GPU cluster that NVIDIA ships needs corresponding network infrastructure, and Arista captures roughly $0.15 in networking revenue for every $1.00 in GPU revenue deployed. That's a pull-through ratio that makes Arista one of the most reliable "AI derivative" investments in the market. The company is growing revenue at 20%+ with 65% gross margins and zero debt. It trades at 35x forward earnings, which sounds expensive until you model the multi-year growth runway.`,

    `The power angle is where I think the most underappreciated opportunity lies. A single modern AI data center consumes 100–150 megawatts of electricity — equivalent to powering a small city. Microsoft's planned data center campus in Wisconsin will consume 700 megawatts. Across the industry, AI data center power demand is projected to reach 50 gigawatts by 2028, up from approximately 15 gigawatts today. That's a 230% increase in three years. Vistra Corp (VST), Constellation Energy (CEG), and NextEra Energy (NEE) are the utilities best positioned to serve this demand. Constellation's recent deal to restart the Three Mile Island Unit 1 nuclear reactor specifically to power a Microsoft data center tells you everything about where this trend is heading. Nuclear, natural gas, and even small modular reactors are all being pulled into the AI power equation.`,

    `My portfolio allocation framework for AI infrastructure is roughly 40% compute (NVIDIA, Broadcom, AMD), 20% networking (Arista, Cisco), 20% power and utilities (Vistra, Constellation), and 20% in the hyperscalers themselves (Microsoft, Google/Alphabet). The hyperscalers are interesting because they're simultaneously the biggest customers and the biggest beneficiaries of AI infrastructure spending. Microsoft's AI-driven revenue growth is more than offsetting the capex drag on free cash flow, and the same is true for Google. The key risk to monitor is demand sustainability. If enterprise AI adoption slows or the ROI on AI applications disappoints, capex budgets will get cut and the entire picks-and-shovels trade unwinds. I don't think that's the base case — the productivity gains from AI are real and measurable — but it's the tail risk that keeps me appropriately sized rather than over-leveraged. Build the position, diversify across the infrastructure stack, and let the secular trend do the heavy lifting.`,
  ],

  "energy-stocks-to-watch-as-the-grid-demands-more-power": [
    `If I've learned one thing in forty years of investing, it's this: follow the kilowatt-hours. Every major technological revolution — electrification in the 1900s, air conditioning in the 1950s, the internet in the 1990s — drove massive increases in electricity demand. The AI revolution is no different, except the ramp is steeper and the capital requirements are larger. The U.S. grid consumed approximately 4,000 terawatt-hours in 2024. Current projections from the Department of Energy suggest that AI data centers alone will add 500–800 terawatt-hours of incremental demand by 2030. That's a 15–20% increase in total grid consumption driven almost entirely by a single use case. For energy investors, this is the most important structural demand shift of our lifetime.`,

    `Let me start with the companies I think are best positioned, and more importantly, why. Vistra Corp (VST) is my top pick, and it's not close. Vistra owns the largest competitive generation fleet in the United States — 41 gigawatts of capacity spanning natural gas, nuclear, coal, and solar. But what makes Vistra special is its nuclear fleet. The company operates six nuclear units across Illinois, Pennsylvania, and New York with a combined capacity of 6.4 gigawatts. Nuclear power is the only proven technology that can provide 24/7 baseload electricity with zero carbon emissions. In a world where tech companies have made net-zero commitments and need reliable power for data centers, nuclear is the obvious answer. Vistra's nuclear plants have power purchase agreements at $40–50 per megawatt-hour, but new contracts for data center power are being signed at $80–100 per MWh. As existing contracts roll off and get repriced, Vistra's earnings power essentially doubles on the nuclear fleet alone.`,

    `Constellation Energy (CEG) is the other nuclear pure-play I favor. Constellation operates the largest nuclear fleet in the United States — 21 reactors across 12 plants with 16.6 gigawatts of capacity. The company's deal with Microsoft to restart the Three Mile Island Unit 1 reactor (the unit that was not involved in the 1979 accident) was a watershed moment for the industry. Microsoft agreed to purchase 100% of the plant's output under a 20-year power purchase agreement at undisclosed but reportedly premium pricing. That single deal added roughly $2 billion in net present value to Constellation's enterprise. And it won't be the last. Amazon, Google, and Meta are all actively pursuing long-term nuclear power agreements. Constellation's stock has already tripled from its 2023 lows, but I believe it's still undervalued relative to the long-term earnings trajectory.`,

    `Beyond nuclear, natural gas generation is critical to the AI power story. The U.S. has the cheapest and most abundant natural gas supply in the world, thanks to the shale revolution. NRG Energy (NRG) operates a large fleet of natural gas plants in Texas, where data center construction is booming. ERCOT, the Texas grid operator, has received interconnection requests for over 30 gigawatts of new data center load — that's more than the total installed capacity of many U.S. states. NRG's Texas fleet will be running at higher utilization rates and capturing higher power prices as demand overwhelms existing supply. The company trades at just 8x forward earnings and offers a 3.6% dividend yield. It's a free cash flow machine that the market is undervaluing because it's labeled as a "boring utility."`,

    `I also want to flag the infrastructure buildout required to deliver power to new data centers. Data centers can't just plug into the existing grid — they need dedicated transmission lines, substations, and switchgear. Quanta Services (PWR) and EMCOR Group (EME) are the two largest electrical infrastructure contractors in the United States, and both are experiencing record backlogs. Quanta's backlog reached $32 billion in Q3 2025, with electric power infrastructure representing the fastest-growing segment. These are the companies physically building the transmission lines and substations that connect data centers to the grid. Their revenue visibility is exceptional — backlog coverage represents 2+ years of revenue — and margins are expanding as pricing power improves in a capacity-constrained market.`,

    `Let me close with a word about valuation and patience. Energy stocks have historically traded at low multiples because investors associate the sector with boom-bust commodity cycles. But the AI-driven demand thesis is different from a commodity cycle — it's a structural, multi-year shift in baseload electricity consumption backed by trillion-dollar technology companies with investment-grade balance sheets. Microsoft isn't going to cancel its data center buildout because natural gas prices fluctuate by $0.50. The demand is non-discretionary and growing. I think the right framework for valuing energy companies exposed to AI demand is closer to how we value infrastructure assets — 12–15x earnings with visibility to long-term contracted cash flows — rather than the 6–8x multiples the sector has historically fetched. That rerating is underway but far from complete. Own the names I've mentioned, reinvest the dividends, and give the thesis time to play out. The grid buildout will take a decade, and the investment returns will compound over the same period.`,
  ],
};

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const article = ARTICLES.find((a) => a.slug === slug);
  const body = slug ? ARTICLE_BODIES[slug] : undefined;

  if (!article || !body) {
    return (
      <div className="max-w-[960px] mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">Article not found</h1>
        <button onClick={() => navigate("/articles")} className="text-accent-blue hover:underline text-sm">
          ← Back to Articles
        </button>
      </div>
    );
  }

  const related = ARTICLES.filter((a) => a.slug !== slug).slice(0, 3);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8">
      {/* Back link */}
      <button
        onClick={() => navigate("/articles")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Articles
      </button>

      <div className="flex gap-8">
        {/* Main content */}
        <article className="flex-1 min-w-0">
          {/* Cover */}
          <div
            className={`h-[280px] md:h-[340px] rounded-lg bg-gradient-to-br ${article.gradient} flex items-center justify-center mb-6`}
          >
            <div className="scale-[2.5] opacity-60">{article.icon}</div>
          </div>

          <h1 className="text-[1.5rem] md:text-[1.75rem] font-bold text-foreground leading-tight mb-4">
            {article.title}
          </h1>

          {/* Author + date */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
            <div className="h-9 w-9 rounded-full bg-accent-blue flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary-foreground">HF</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">HedgeFun Team</p>
              <p className="text-xs text-muted-foreground">{article.date}</p>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-5">
            {body.map((paragraph, i) => (
              <p key={i} className="text-[0.9375rem] text-foreground leading-[1.75]">
                {paragraph}
              </p>
            ))}
          </div>
        </article>

        {/* Sidebar */}
        <aside className="hidden lg:block w-[280px] shrink-0 space-y-5">
          {/* Newsletter card */}
          <div className="border border-border rounded-md p-4">
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">Market Newsletter</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Get a daily email with the top market news in bullet point format.
            </p>
            <Input placeholder="Enter your email" className="h-8 text-sm mb-2" />
            <Button
              size="sm"
              className="w-full text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
            >
              Subscribe
            </Button>
          </div>

          {/* Related articles */}
          <div className="border border-border rounded-md p-4">
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-3">Related Articles</h3>
            <div className="space-y-3">
              {related.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => navigate(`/articles/${r.slug}`)}
                  className="w-full text-left group"
                >
                  <div className="flex items-start gap-2">
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0 group-hover:text-accent-blue transition-colors" />
                    <div>
                      <p className="text-xs font-medium text-foreground leading-snug group-hover:text-accent-blue transition-colors line-clamp-2">
                        {r.title}
                      </p>
                      <p className="text-[0.625rem] text-muted-foreground mt-0.5">{r.date}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
