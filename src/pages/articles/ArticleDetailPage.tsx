import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Twitter, Linkedin, LinkIcon, Check } from "lucide-react";
import { ARTICLES, getReadTime } from "./ArticlesPage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePageSeo } from "@/hooks/usePageSeo";
import { toast } from "@/hooks/use-toast";
import { BRAND } from "@/config/brand";

/* ── Full Article Bodies ──────────────────────────── */
const ARTICLE_BODIES: Record<string, string[]> = {
  // ── NEW ARTICLE 1 ──
  "jensen-huang-agi-achieved": [
    `## Jensen Huang's Bold Claim`,
    `At Nvidia's annual GTC conference in March 2026, CEO Jensen Huang made a statement that sent shockwaves through the technology industry and financial markets: "AGI has been achieved." The declaration, delivered during his keynote address to a packed arena of developers, researchers, and investors, was met with a mixture of stunned silence and thunderous applause. Nvidia's stock (NVDA) surged 8% in after-hours trading before settling into a 4.2% gain the following day, adding roughly $120 billion in market capitalization in a single session.`,
    `## What Huang Actually Said`,
    `It's important to parse Huang's words carefully, because the definition of artificial general intelligence has been debated for decades. Huang argued that modern AI systems — particularly those running on Nvidia's latest Blackwell Ultra architecture — can now perform "any intellectual task that a human can perform, given sufficient context and compute." He pointed to recent benchmarks showing AI systems scoring above the 95th percentile on bar exams, medical licensing exams, graduate-level mathematics, and creative writing assessments. He also highlighted Nvidia's partnership with several pharmaceutical companies where AI systems independently designed novel drug candidates that are now in Phase II clinical trials — something that would have been considered science fiction just three years ago.`,
    `## The Market Implications for NVDA`,
    `For Nvidia investors, the AGI claim — whether you agree with it or not — serves as a powerful demand signal. If we've reached or are approaching AGI, the computational requirements don't shrink. They explode. AGI-class systems require orders of magnitude more compute than narrow AI applications. Huang's own projections suggest that global demand for AI compute will increase 10x over the next five years, driven by the transition from task-specific models to general-purpose reasoning systems. Nvidia's data center revenue, which hit $96 billion in fiscal year 2026, could conceivably reach $250 billion by 2030 under this thesis. The company's gross margins remain above 74% on data center GPUs, and the upcoming Rubin architecture (expected in 2027) promises another 3x improvement in performance per watt.`,
    `## What AGI Means for Semiconductor Demand`,
    `The ripple effects extend far beyond Nvidia. If AGI-class capabilities are real, every major enterprise will need to deploy these systems — not just Big Tech. Banks, hospitals, law firms, manufacturers, and governments will all need access to AGI-level compute. This creates a demand curve that is structurally higher than anything the semiconductor industry has ever seen. Companies like TSMC (TSM), which manufactures Nvidia's chips, AMD (AMD), which competes in the data center GPU market, and Broadcom (AVGO), which provides custom AI accelerators, all stand to benefit enormously. The semiconductor equipment makers — ASML (ASML), Applied Materials (AMAT), and Lam Research (LRCX) — are also positioned for a sustained upcycle as chip manufacturers race to add fabrication capacity.`,
    `## Investor Takeaways`,
    `The prudent approach for investors is to avoid getting swept up in the hype while still positioning for the structural trend. Whether we call it AGI or "very advanced narrow AI" is largely a semantic debate — the economic implications are the same. Compute demand is accelerating, Nvidia has a dominant competitive position, and the ecosystem of supporting companies (TSMC, Broadcom, Arista Networks, Vertiv) will benefit from the infrastructure buildout. I'd recommend maintaining a diversified position across the AI compute stack rather than concentrating solely in NVDA. The stock trades at 35x forward earnings, which is reasonable for a company growing revenue at 50%+ annually, but leaves limited room for execution missteps. Diversification across the picks-and-shovels ecosystem — compute, networking, power, and cooling — provides exposure to the same secular trend with less single-stock risk. The AGI debate will continue, but the investment opportunity is clear and present.`,
  ],

  // ── NEW ARTICLE 2 ──
  "china-manus-meta-deal-review": [
    `## Beijing Tightens the Screws on Tech Deals`,
    `In a dramatic escalation of US-China tech tensions, Chinese regulators announced on March 22, 2026, that all founders and senior executives of Manus AI — the Chinese artificial intelligence startup — have been barred from leaving the country while Beijing conducts a "comprehensive national security review" of Manus's proposed acquisition by Meta Platforms (META). The travel ban, which affects at least 12 individuals including CEO Li Wei and CTO Zhang Mei, represents one of the most aggressive regulatory actions China has taken against a cross-border technology deal.`,
    `## The Manus-Meta Deal: Background`,
    `Meta announced its intention to acquire Manus AI for approximately $4.8 billion in January 2026. Manus, founded in 2023 in Shenzhen, had rapidly become one of China's most prominent AI startups, developing advanced autonomous agent systems capable of executing complex multi-step tasks with minimal human oversight. Meta's interest was straightforward: Manus's agent technology complemented Meta's own AI ambitions, particularly in powering autonomous AI assistants across WhatsApp, Instagram, and the metaverse. The deal was structured as a full acquisition with Manus's engineering team relocating to Meta's Menlo Park campus — a detail that appears to have triggered Beijing's intervention.`,
    `## Why China Intervened`,
    `China's regulatory response should be understood in the context of the broader technology cold war between Washington and Beijing. Since 2022, the United States has imposed increasingly aggressive export controls on advanced semiconductors and AI technology flowing to China. The CHIPS Act, entity list expansions, and restrictions on cloud computing services have all been designed to slow China's AI development. From Beijing's perspective, allowing a cutting-edge Chinese AI company to be acquired by an American tech giant — with its entire engineering team relocating to the US — would represent an unacceptable brain drain and technology transfer at a moment when AI capabilities are viewed as critical to national security.`,
    `## Geopolitical Implications`,
    `The Manus situation sets a precedent that could chill cross-border M&A activity in the technology sector for years. If Chinese regulators are willing to effectively hold company founders hostage to block an acquisition, no Chinese AI startup will pursue an exit to a Western acquirer. This creates a bifurcation of the global AI ecosystem that has significant investment implications. Western AI companies will be unable to acquire Chinese technology or talent, while Chinese companies will be unable to access Western capital markets or strategic partnerships. The net effect is two parallel AI ecosystems developing independently — each potentially reaching AGI-class capabilities on different timelines and with different approaches.`,
    `## What This Means for Investors`,
    `For Meta shareholders, the near-term impact is limited. The $4.8 billion acquisition price represents less than 1% of Meta's market capitalization, and the company has the internal AI talent to develop agent capabilities without Manus. However, the deal's collapse — which now appears increasingly likely — signals that the era of freely flowing technology talent and IP between the US and China is definitively over. For investors in Chinese technology companies, the implications are more significant. The travel ban demonstrates that Beijing views Chinese AI talent as a strategic national asset that cannot be exported. This could actually benefit Chinese AI companies in the short term by preventing talent drain, but it limits their exit options and access to Western capital. The broader takeaway is that geopolitical risk is now a permanent feature of technology investing, and portfolios should be constructed with this reality in mind. Diversification across geographies isn't just a nice-to-have — it's essential.`,
  ],

  // ── NEW ARTICLE 3 ──
  "oil-prices-fall-iran-ceasefire": [
    `## The Ceasefire Report That Moved Markets`,
    `Crude oil prices dropped sharply on March 24, 2026, falling as much as 6.2% in a single session after reports emerged that the United States had proposed a ceasefire agreement with Iran that could de-escalate tensions in the Persian Gulf region. Brent crude fell from $112.40 to $105.43 per barrel, while WTI crude dropped from $108.90 to $101.80. The move wiped approximately $180 billion from the market capitalization of global energy companies in a matter of hours. But the question every oil trader and energy investor is asking isn't about the ceasefire — it's about whether the recent spike toward triple-digit oil prices was the beginning of a run to $200 per barrel, or a geopolitical risk premium that's about to evaporate.`,
    `## The Bull Case for $200 Oil`,
    `The argument for $200 oil rests on three pillars, each of which has genuine merit. First, global spare production capacity is at its lowest level in decades. OPEC+'s effective spare capacity — the amount of additional oil that could be brought online within 90 days — is estimated at just 2.5 million barrels per day, concentrated almost entirely in Saudi Arabia and the UAE. For context, global oil demand is approximately 104 million barrels per day, meaning spare capacity represents less than 2.5% of total consumption. Any significant supply disruption — a Strait of Hormuz closure, a Libyan civil war escalation, or Venezuelan production collapse — could overwhelm the available cushion.`,
    `## The Bear Case: Why $200 Is Unlikely`,
    `However, the bear case against $200 oil is equally compelling. Demand destruction is a powerful force that oil bulls consistently underestimate. At $100+ per barrel, behavioral changes accelerate: consumers drive less, airlines reduce routes, industrial users switch to natural gas or electricity where possible, and governments release strategic petroleum reserves. The International Energy Agency estimates that sustained $120+ oil prices would destroy approximately 1.5 million barrels per day of demand within six months. Additionally, US shale production — while no longer growing rapidly — has not peaked. Producers in the Permian Basin can add 500,000 barrels per day within 9-12 months if prices remain above $90, providing a supply response that didn't exist in previous oil shocks.`,
    `## Impact on Energy Stocks`,
    `The ceasefire-driven selloff hit energy stocks hard but unevenly. ExxonMobil (XOM) fell 4.8%, Chevron (CVX) dropped 5.2%, and the Energy Select Sector SPDR Fund (XLE) declined 5.6%. However, oil services companies like Schlumberger (SLB) and Halliburton (HAL) fell more — 7-8% — because lower oil prices reduce the incentive for new drilling activity. On the other side of the trade, airlines and transportation companies rallied. Delta Air Lines (DAL) jumped 3.4%, and FedEx (FDX) gained 2.8%, reflecting the direct benefit of lower fuel costs to their operating margins.`,
    `## OPEC's Dilemma and Trader Positioning`,
    `OPEC finds itself in a difficult position. Saudi Arabia needs oil above $85 per barrel to balance its budget and fund Vision 2030 development projects. Russia needs prices above $70 to maintain its war economy. But if OPEC cuts production further to support prices, it risks losing market share to US shale producers who are happy to fill the gap. The organization's cohesion is being tested, with reports of disagreements between Saudi Arabia and the UAE over production quota allocations. Meanwhile, speculative positioning in oil futures is heavily long, with hedge funds and commodity trading advisors holding near-record net long positions in Brent and WTI futures. If the ceasefire materializes and geopolitical risk premiums compress, a wave of long liquidation could push prices significantly lower — potentially back to the $85-90 range that prevailed before the Iran tensions escalated.`,
    `## What Investors Should Do`,
    `The prudent approach is to treat energy stocks as a barbell. On one end, own high-quality integrated majors like ExxonMobil and Chevron that can generate strong free cash flow even at $70 oil and return capital through buybacks and dividends. These are companies you hold through commodity cycles. On the other end, maintain a tactical position in oil price-sensitive names — exploration and production companies, oil services firms — that you can scale up or down based on your view of the geopolitical situation. What you should not do is make an all-or-nothing bet on $200 oil. The scenario is possible but improbable, and the risk-reward of positioning for a tail event is poor relative to owning quality companies that compound through any price environment.`,
  ],

  // ── NEW ARTICLE 4 ──
  "500-million-oil-bet-trump-statement": [
    `## The Trade That Raised Every Red Flag`,
    `At 2:47 PM Eastern Time on March 20, 2026, a single trader — or entity — placed a $500 million options trade on West Texas Intermediate crude oil futures through the CME Group. The trade consisted of approximately 45,000 call option contracts at the $115 strike price expiring in April 2026, purchased for a premium of roughly $11 per contract. At 3:15 PM — exactly 28 minutes later — former President Donald Trump took to Truth Social to announce a "5-day pause in all energy-related strike operations against Iran," a statement that immediately sent crude oil prices plunging 4.7% and handed the mystery trader an estimated $85 million in unrealized losses. But here's the twist that has regulators scrambling: the trade was profitable if viewed as a hedge against an existing short position, or if the trader had advance knowledge that the statement would initially be interpreted as bearish before being walked back.`,
    `## The Timeline Under Scrutiny`,
    `The SEC and CFTC have both confirmed they are investigating the trade, which is already being compared to some of the most notorious cases of suspected insider trading in commodity markets. The timeline is damning. At 2:30 PM, no public reports suggested an imminent Trump statement on Iran. At 2:47 PM, the trade was placed. At 3:15 PM, the statement was published. The 28-minute window between the trade and the announcement is too narrow to attribute to coincidence and too wide to attribute to algorithmic reaction to early leaks. Someone, somewhere, had information that wasn't public — or at the very least, had a highly specific view on the timing and content of a presidential statement.`,
    `## Historical Precedents`,
    `This isn't the first time suspicious trading activity has preceded major geopolitical announcements. In September 2019, Saudi Aramco's Abqaiq processing facility was attacked by drones, temporarily removing 5.7 million barrels per day of Saudi production — roughly 5% of global supply. Subsequent investigations revealed unusual options activity in oil markets in the 48 hours before the attack, though no charges were ever filed. In 2011, trading in S&P 500 futures surged in the hours before the Osama bin Laden raid was announced, with the FBI concluding the activity was "coincidental." The pattern is familiar: suspicious timing, massive positions, and investigations that often lead nowhere due to the difficulty of proving intent in fast-moving commodity markets.`,
    `## The Market Manipulation Question`,
    `The legal framework for prosecuting this type of activity is complex. If the trader had advance knowledge of Trump's statement, the trade likely constitutes wire fraud and manipulation under the Commodity Exchange Act. However, if the trader was simply making a directional bet based on publicly available geopolitical analysis — knowing that a Trump statement on Iran was likely but not certain — the trade is perfectly legal, regardless of size. The key legal question is the source of the information. If a government official, a member of Trump's inner circle, or someone with access to the former president's communications tipped the trader, that's a federal crime. If the trader independently assessed the probability of a statement and sized accordingly, that's just aggressive trading.`,
    `## The SEC's Challenge`,
    `Investigating commodity market manipulation is significantly harder than investigating equity insider trading. In stock markets, the SEC can trace share ownership through brokerage records and identify insiders through corporate filings. In commodity futures, trades are executed through clearing members, and the ultimate beneficial owner of a position can be obscured through shell companies, offshore accounts, and intermediary brokers. The CFTC has subpoena power to compel clearing members to reveal their clients, but the process takes months and can be complicated by jurisdictional issues if the trader is based overseas. The $500 million size of the trade is both the best evidence and the biggest challenge — it's large enough to attract attention but potentially large enough to belong to a sovereign wealth fund or major commodity trading house that routinely takes positions of that magnitude.`,
    `## What Investors Should Take Away`,
    `For ordinary investors, the lesson isn't about trying to front-run presidential statements — it's about understanding that commodity markets are inherently political and that large, sophisticated players have information advantages that retail investors simply don't. The practical implication is to be cautious about holding leveraged commodity positions around major geopolitical events. Use options to define your risk, avoid excessive leverage, and remember that the smartest trade is sometimes no trade at all. If the investigation reveals genuine insider trading, it will be a landmark case that reshapes how geopolitical information flows between government and markets. If it doesn't, it will join a long list of suspicious trades that were too complex to prosecute. Either way, the $500 million oil trade is a reminder that in commodity markets, the biggest edge isn't a better algorithm — it's better information.`,
  ],

  // ── NEW ARTICLE 5 ──
  "market-volatility-tariff-uncertainty-2026": [
    `## The Volatility Regime Has Changed`,
    `The CBOE Volatility Index (VIX) has averaged 24.3 in the first quarter of 2026, compared to a historical average of approximately 19. More importantly, the VIX has spiked above 30 on seven separate occasions in the past 90 days — a frequency not seen since the pandemic selloff of early 2020. The S&P 500 has experienced daily moves of 1% or more in 38% of trading sessions this quarter, compared to just 12% in the same period last year. Something fundamental has shifted in market structure, and the primary catalyst is tariff policy uncertainty emanating from Washington.`,
    `## What's Driving the Volatility`,
    `The tariff situation in 2026 is uniquely disruptive because of its unpredictability. Unlike previous trade conflicts that followed a relatively linear escalation path, the current administration has adopted a "maximum pressure, selective relief" approach that makes it nearly impossible for companies and investors to model outcomes. In January, the White House announced a 25% tariff on all goods imported from Canada and Mexico, only to partially reverse the order two weeks later for automotive components. In February, a 15% tariff on European Union steel and aluminum was announced, withdrawn after a phone call with the EU trade commissioner, and then reimposed at 10% three days later. Each announcement generates a market reaction, and the reversals generate another one.`,
    `## The Impact on Corporate Earnings`,
    `The real economic damage isn't from the tariffs themselves — it's from the uncertainty. CEOs and CFOs are telling analysts on earnings calls that they cannot provide guidance because they don't know what the tariff regime will look like in 90 days. Capital expenditure decisions are being delayed. Inventory management has become a guessing game. Companies like Caterpillar (CAT), Deere & Co. (DE), and 3M (MMM) — all heavily exposed to global supply chains — have widened their earnings guidance ranges to levels not seen since the early days of COVID. When companies can't forecast, investors can't value, and when investors can't value, volatility fills the void.`,
    `## S&P 500 Performance in Context`,
    `Despite the volatility, the S&P 500 is essentially flat year-to-date in 2026, up just 1.2% through March 24th. But that headline number masks enormous sector dispersion. Technology stocks, which are less exposed to tariff risk due to their service-oriented business models and domestic revenue concentration, are up 8.4%. Industrials are down 6.2%. Consumer discretionary, hit by fears of higher import costs flowing through to retail prices, is down 4.8%. Utilities, the classic defensive sector, are up 11.3% — their best relative performance in over a decade. This kind of sector rotation and dispersion is characteristic of late-cycle markets where macro uncertainty, rather than fundamental deterioration, is driving price action.`,
    `## Defensive vs. Growth Positioning`,
    `The question facing every investor right now is whether to rotate into defensive positioning or stay the course with growth allocations. My framework is to look at what the bond market is telling us. The 10-year Treasury yield has fallen from 4.6% in January to 4.1% in late March — a significant move that signals the bond market is pricing in slower economic growth, not accelerating inflation from tariffs. When bonds are rallying alongside utilities and healthcare stocks, the market is telling you that recession risk is rising. In this environment, I'd recommend shifting 10-15% of equity exposure from cyclicals (industrials, materials, consumer discretionary) into defensive sectors (utilities, healthcare, consumer staples) and maintaining a 5-10% cash position as dry powder for buying opportunities.`,
    `## What Investors Should Watch`,
    `Three indicators will determine whether the current volatility regime persists or resolves. First, watch the US-China trade dialogue. The most impactful potential tariff — a broad-based levy on Chinese imports — has been threatened but not implemented. If it materializes, expect another 5-10% drawdown in the S&P 500. If it's averted through negotiation, the relief rally could be substantial. Second, monitor the Federal Reserve. The Fed has held rates steady at 4.75% since December 2025, but tariff-driven inflation concerns are complicating the path to rate cuts. If the Fed signals that tariff uncertainty is slowing the economy enough to warrant cuts, that would be bullish for equities. Third, watch corporate earnings revisions. So far, analysts have been slow to cut 2026 earnings estimates, which remain at approximately $270 per share for the S&P 500. If tariff uncertainty begins to show up in actual earnings misses — not just wider guidance ranges — the market will need to re-price lower. Stay disciplined, stay diversified, and use volatility as an opportunity to buy quality companies at better prices. The uncertainty will eventually resolve, and patient investors will be rewarded.`,
  ],

  // ── EXISTING ARTICLE BODIES ──
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

/* ── Markdown-style heading renderer ─── */
function renderBody(paragraphs: string[]) {
  return paragraphs.map((p, i) => {
    if (p.startsWith("## ")) {
      return (
        <h2 key={i} className="text-[1.25rem] font-bold text-foreground mt-8 mb-3">
          {p.replace("## ", "")}
        </h2>
      );
    }
    if (p.startsWith("### ")) {
      return (
        <h3 key={i} className="text-[1.0625rem] font-bold text-foreground mt-6 mb-2">
          {p.replace("### ", "")}
        </h3>
      );
    }
    return (
      <p key={i} className="text-[1.125rem] text-foreground leading-[1.8] mb-[1.5rem]">
        {p}
      </p>
    );
  });
}

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const article = ARTICLES.find((a) => a.slug === slug);
  const body = slug ? ARTICLE_BODIES[slug] : undefined;
  const related = ARTICLES.filter((a) => a.slug !== slug).slice(0, 2);

  const wordCount = useMemo(() => {
    if (!body) return 0;
    return body.reduce((acc, p) => acc + p.split(/\s+/).length, 0);
  }, [body]);

  const readTime = getReadTime(wordCount);

  const jsonLd = useMemo(() => {
    if (!article) return undefined;
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.excerpt,
      datePublished: article.date,
      url: `https://www.hedgefun.fun/articles/${slug}`,
      author: { "@type": "Organization", name: article.author ?? "HedgeFun" },
      publisher: {
        "@type": "Organization",
        name: "HedgeFun",
        url: "https://www.hedgefun.fun",
      },
    };
  }, [article, slug]);

  usePageSeo({
    title: article ? `${article.title} — HedgeFun Blog` : "Article Not Found — HedgeFun",
    description: article?.excerpt ?? "Article not found.",
    canonical: slug ? `https://www.hedgefun.fun/articles/${slug}` : undefined,
    jsonLd: jsonLd,
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://www.hedgefun.fun/articles/${slug}`);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

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

  const tags = article.tags ?? ["Markets", "Analysis"];

  return (
    <div>
      {/* Back to Articles */}
      <div className="max-w-[720px] mx-auto px-4 pt-4 pb-2">
        <Link
          to="/articles"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent-blue transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all Articles
        </Link>
      </div>

      {/* Hero Image */}
      <div className="relative w-full h-[280px] sm:h-[400px] overflow-hidden" style={{ backgroundColor: '#f4f4f5' }}>
        <img
          src={article.image}
          alt={article.title}
          width={1200}
          height={400}
          className="w-full h-full object-cover"
          loading="eager"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 max-w-[720px] mx-auto">
          {/* Tags */}
          <div className="flex gap-2 mb-3">
            {tags.map((tag) => (
              <span key={tag} className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-accent-blue/90 text-white">
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-[1.375rem] sm:text-[1.75rem] font-bold text-white leading-tight">
            {article.title}
          </h1>
        </div>
      </div>

      {/* Article Body */}
      <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
        {/* Author + date + read time */}
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border">
          <div className="h-9 w-9 rounded-full bg-accent-blue flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary-foreground">HF</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{article.author ?? "HedgeFun Team"}</p>
            <p className="text-xs text-muted-foreground">{article.date} · {readTime}</p>
          </div>
          {/* Share buttons */}
          <div className="flex items-center gap-1.5">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`https://www.hedgefun.fun/articles/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Share on Twitter"
            >
              <Twitter className="h-4 w-4" />
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://www.hedgefun.fun/articles/${slug}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Share on LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </a>
            <button
              onClick={handleCopyLink}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Copy link"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <LinkIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Body */}
        <div>{renderBody(body)}</div>

        {/* Related Articles */}
        <div className="mt-12 pt-8 border-t border-border">
          <h2 className="text-[1.125rem] font-bold text-foreground mb-5">Related Articles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {related.map((r) => (
              <button
                key={r.slug}
                onClick={() => navigate(`/articles/${r.slug}`)}
                className="text-left border border-border rounded-md overflow-hidden hover:border-accent-blue transition-colors group bg-surface-card"
              >
                <div className="aspect-video overflow-hidden" style={{ backgroundColor: '#f4f4f5' }}>
                  <img
                    src={r.image}
                    alt={r.title}
                    width={400}
                    height={225}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-[0.875rem] font-bold text-foreground leading-snug group-hover:text-accent-blue transition-colors line-clamp-2 mb-1">
                    {r.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{r.date}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
