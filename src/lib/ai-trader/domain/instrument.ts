export const AI_TRADER_ASSET_CLASSES = ["US_EQUITY"] as const;
export type AiTraderAssetClass = (typeof AI_TRADER_ASSET_CLASSES)[number];

export interface AiTraderInstrument {
  symbol: string;
  assetClass: AiTraderAssetClass;
  venue: string | null;
}
