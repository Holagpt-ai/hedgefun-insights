import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function SpacPage() {
  useEffect(() => {
    document.title = "SPAC List & Guide | HedgeFun";
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            SPAC List & Guide
          </h1>

          <div className="space-y-10">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What Is a SPAC?
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                A Special Purpose Acquisition Company (SPAC) is a shell corporation listed on a stock exchange with the sole purpose of acquiring or merging with a private company, thereby taking that private company public without going through the traditional initial public offering (IPO) process. SPACs are also commonly referred to as blank check companies because they raise capital from public investors before identifying a specific acquisition target.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                The SPAC process begins with a sponsor — typically an experienced investor, private equity firm, or industry executive — forming the shell company and filing for an IPO. The SPAC raises capital at a fixed price, usually $10 per unit, with each unit typically consisting of one share and a fraction of a warrant. The proceeds are placed in a trust account and invested in safe instruments such as U.S. Treasury bills until a merger target is identified and approved by shareholders.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How the SPAC Merger Process Works
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Once a SPAC completes its IPO and has capital in trust, the sponsor typically has 18 to 24 months to identify and complete a merger with a target company. This process unfolds in several stages:
              </p>

              <ul className="space-y-4 text-muted-foreground list-disc list-inside">
                <li>
                  <strong className="text-foreground">Target Identification:</strong> The SPAC sponsor conducts due diligence on potential acquisition targets, typically focusing on companies in an industry where the sponsor has operational expertise.
                </li>

                <li>
                  <strong className="text-foreground">Letter of Intent:</strong> The SPAC and target company sign a non-binding letter of intent outlining the proposed merger terms, valuation, and deal structure.
                </li>

                <li>
                  <strong className="text-foreground">Definitive Agreement:</strong> After full due diligence, a binding merger agreement is signed and announced publicly. This triggers a PIPE (Private Investment in Public Equity) process where additional institutional capital is raised to fund the combined entity.
                </li>

                <li>
                  <strong className="text-foreground">SEC Review and Proxy Filing:</strong> The merger is subject to SEC review. A proxy statement or registration statement is filed and distributed to SPAC shareholders, detailing the target company's financials, business model, and risk factors.
                </li>

                <li>
                  <strong className="text-foreground">Shareholder Vote:</strong> SPAC shareholders vote on whether to approve the merger. Shareholders who vote against the merger have the right to redeem their shares at the trust value (typically close to $10 per share plus accrued interest).
                </li>

                <li>
                  <strong className="text-foreground">Merger Completion (De-SPAC):</strong> If approved, the merger closes and the combined entity begins trading under the target company's new ticker symbol. The SPAC structure dissolves and the surviving entity operates as a standard publicly traded company.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                SPACs vs. Traditional IPOs
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                SPACs offer several structural differences compared to traditional IPOs that affect both the companies going public and the investors participating in the process:
              </p>

              <ul className="space-y-4 text-muted-foreground list-disc list-inside">
                <li>
                  <strong className="text-foreground">Speed:</strong> The SPAC merger process can be completed in 3–6 months once a target is identified, compared to the 12–18 month timeline typical of a traditional IPO roadshow and underwriting process.
                </li>

                <li>
                  <strong className="text-foreground">Price Certainty:</strong> In a traditional IPO, the final offering price is set just before trading begins and can deviate significantly from initial estimates based on market conditions. SPAC mergers negotiate a fixed valuation in advance, providing greater price certainty for the target company.
                </li>

                <li>
                  <strong className="text-foreground">Forward-Looking Projections:</strong> Unlike traditional IPO prospectuses, SPAC merger filings can include forward-looking financial projections. This allows pre-revenue or early-stage companies to present growth narratives that would not be permissible in a standard IPO document.
                </li>

                <li>
                  <strong className="text-foreground">Investor Redemption Rights:</strong> SPAC investors have the unique ability to redeem their shares at trust value regardless of how they vote on the merger, providing a capital preservation floor not available in traditional IPO investing.
                </li>

                <li>
                  <strong className="text-foreground">Dilution:</strong> SPAC structures typically result in greater dilution for post-merger shareholders due to sponsor promote shares (typically 20% of pre-IPO shares issued to sponsors at minimal cost) and outstanding warrants.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Risks of SPAC Investing
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                SPAC investing carries unique risks that distinguish it from both traditional IPO investing and general equity investing. The most significant risk is sponsor misalignment — SPAC sponsors receive their promote shares at minimal cost and have strong financial incentives to complete a deal regardless of whether the target company represents a genuinely attractive investment for public shareholders.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                The 18–24 month deadline creates time pressure that can lead sponsors to pursue suboptimal targets rather than return capital to investors. Research has consistently shown that SPAC mergers, on average, underperform traditional IPOs and the broader market in the 12–36 months following merger completion, particularly when the target company is pre-revenue or highly speculative.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Dilution from warrants and sponsor promote shares can significantly reduce per-share value for investors who hold through the merger. The forward-looking projections included in SPAC merger documents have historically proven highly optimistic, with many SPAC-merged companies failing to achieve their projected revenue and profitability targets.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Regulatory scrutiny of the SPAC market has increased significantly following the boom period of 2020–2021. The SEC has implemented enhanced disclosure requirements and has signaled greater enforcement attention toward misleading projections and sponsor conflicts of interest in SPAC transactions.
              </p>
            </section>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
