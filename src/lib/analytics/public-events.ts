import { trackEvent } from "@/lib/analytics";

export function trackPublicStockResearch(input: {
  symbol: string;
  source: string;
  surface?: string;
}) {
  trackEvent("public_stock_research", {
    ticker: input.symbol.trim().toUpperCase(),
    source: input.source,
    surface: input.surface ?? "public",
  });
}

export function trackPublicDiscoveryNav(input: {
  from: string;
  to: string;
  symbol?: string;
}) {
  trackEvent("public_discovery_nav", {
    from_surface: input.from,
    to_surface: input.to,
    ticker: input.symbol?.trim().toUpperCase(),
  });
}

export function trackPublicDashboardCta(input: {
  symbol: string;
  destination: string;
  authenticated: boolean;
}) {
  trackEvent("public_dashboard_cta", {
    ticker: input.symbol.trim().toUpperCase(),
    destination: input.destination,
    auth_state: input.authenticated ? "signed_in" : "guest",
  });
}

export function trackAuthHandoff(input: {
  mode: "login" | "signup";
  returnPath: string;
  source: string;
}) {
  trackEvent("auth_handoff", {
    mode: input.mode,
    return_path: input.returnPath,
    source: input.source,
  });
}

export function trackAuthDestinationRestored(input: {
  destination: string;
  source: string;
}) {
  trackEvent("auth_destination_restored", {
    destination: input.destination,
    source: input.source,
  });
}
