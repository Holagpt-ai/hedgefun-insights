/**
 * Architectural seam: Stocksist intelligence (screeners, catalyst, historical profiles,
 * AI analyst outputs) feeds strategy engines; execution consumes TradeIntent only.
 *
 * Sprint 0 does NOT implement Stocksist Intelligence API or MCP.
 * Keep imports one-directional: execution must not import UI or broker vendor SDKs.
 * Future external consumers (Robinhood agents, third-party agents) should call
 * intelligence surfaces — not bypass RiskGateway.
 */

export const EXECUTION_INTELLIGENCE_BOUNDARY_VERSION = "sprint-0";
