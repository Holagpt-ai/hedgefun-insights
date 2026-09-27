import type { AiTraderAccountId } from "@/lib/ai-trader/domain/ids";
import type { AiTraderAssetClass } from "@/lib/ai-trader/domain/instrument";

/**
 * System-owned trading book / broker identity.
 * Credentials never belong on this record.
 */
export interface AiTraderAccount {
  accountId: AiTraderAccountId;
  brokerProviderId: string | null;
  assetClass: AiTraderAssetClass;
  displayName: string | null;
}

export const AI_TRADER_ACCOUNT_SECRET_KEYS = [
  "apiKey",
  "apiSecret",
  "accessToken",
  "refreshToken",
  "password",
  "credential",
] as const;

export function accountRecordContainsSecretKey(record: Record<string, unknown>): boolean {
  return AI_TRADER_ACCOUNT_SECRET_KEYS.some((key) => key in record);
}
