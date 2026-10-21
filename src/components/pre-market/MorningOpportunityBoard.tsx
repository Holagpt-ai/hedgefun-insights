import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import type { MorningOpportunityBoard as BoardModel, MorningOpportunityCard } from "@/lib/am-inbox/morning-opportunity-board";
import {
  buildMarketEvidenceHandoff,
  persistMarketEvidenceHandoff,
  verifiedCatalystHandoffFields,
} from "@/lib/daily-intelligence/market-evidence-handoff";
import { opportunityWorkflowPaths } from "@/lib/scanner-intelligence/workflow-routes";
import { trustStateLabel } from "@/lib/market-data/trust-states";
import { touchWorkflowHandoff } from "@/lib/historical-workflow/workflow-symbol-routes";

function metric(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(digits)}${suffix}`;
}

function volumeLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function catalystLabel(status: MorningOpportunityCard["catalystStatus"]): string {
  if (status === "verified") return "Verified catalyst";
  if (status === "none") return "No verified catalyst";
  if (status === "unavailable") return "Catalyst intel unavailable";
  return "Checking catalyst intel…";
}

function Card({
  card,
  platform,
}: {
  card: MorningOpportunityCard;
  platform?: SymbolCatalystPlatformContext | null;
}) {
  const { user } = useAuth();
  const routes = opportunityWorkflowPaths(card.symbol, card.eventType, card.securityId);
  const persistEvidence = () => {
    touchWorkflowHandoff(card.symbol, "inbox");
    const payload = buildMarketEvidenceHandoff({
      symbol: card.symbol,
      securityId: card.securityId,
      contextScope: card.continuationCategory ? "prior_session" : "current_session",
      sessionDate: null,
      sourceSurface: "morning_opportunity",
      providerAsOf: card.asOf,
      price: card.price,
      volume: card.volume,
      rvol5m: card.rvol5m,
      gapPercent: card.gapPercent,
      primaryScannerEvent: card.eventType,
      ...verifiedCatalystHandoffFields(platform),
      userId: user?.id,
    });
    if (payload) persistMarketEvidenceHandoff(payload);
  };

  const links = routes
    ? [
      { href: routes.ai, label: "AI" },
      { href: routes.catalyst, label: "Catalyst" },
      { href: routes.watchlist, label: "Watchlist" },
      { href: routes.journal, label: "Journal" },
      { href: routes.screeners, label: "Screeners" },
      { href: routes.action_center, label: "Action Center" },
    ]
    : [];

  return (
    <article className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-tight">{card.symbol}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {trustStateLabel(card.trust)}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {card.eventLabel ?? (card.continuationCategory ? card.continuationCategory.split("_").join(" ") : "Continuation")}
        {card.detectedAt ? ` · ${card.detectedAt}` : ""}
      </p>
      {card.qualificationSummary ? (
        <p className="text-[10px] text-muted-foreground">{card.qualificationSummary}</p>
      ) : null}
      <p className="text-[11px] tabular-nums text-muted-foreground">
        Vol {volumeLabel(card.volume)} · 5m RVOL {metric(card.rvol5m, 2)} · HOD {metric(card.distanceFromHodPct, 2, "%")}
      </p>
      <p className="text-[11px] text-muted-foreground">{catalystLabel(card.catalystStatus)}</p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {links.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              onClick={persistEvidence}
              className="text-[10px] font-medium text-accent-blue hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

export function MorningOpportunityBoard({
  model,
  loading = false,
  platformBySymbol,
}: {
  model: BoardModel;
  loading?: boolean;
  platformBySymbol?: Map<string, SymbolCatalystPlatformContext>;
}) {
  if (loading && model.sections.length === 0) return null;
  if (model.emptyMessage) {
    return (
      <section className="flex flex-col gap-1" aria-label="Morning Opportunity">
        <h2 className="text-sm font-semibold">Morning Opportunity</h2>
        {model.radarSessionLabel ? (
          <p className="text-[10px] text-muted-foreground">
            Radar session: {model.radarSessionLabel} · observations may differ from other tabs
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{model.emptyMessage}</p>
        {model.exclusionHints.length > 0 ? (
          <ul className="list-inside list-disc text-[11px] text-muted-foreground">
            {model.exclusionHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Morning Opportunity" data-testid="morning-opportunity-board">
      <div>
        <h2 className="text-sm font-semibold">Morning Opportunity</h2>
        <p className="text-[11px] text-muted-foreground">
          Strongest qualifying names · volume first · event urgency second
          {model.radarSessionLabel ? ` · ${model.radarSessionLabel}` : ""}
        </p>
      </div>
      {model.sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </h3>
          <div className="flex flex-col gap-2 md:flex-row">
            {section.cards.map((card) => (
              <Card
                key={`${section.id}-${card.symbol}`}
                card={card}
                platform={platformBySymbol?.get(card.symbol.toUpperCase())}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
