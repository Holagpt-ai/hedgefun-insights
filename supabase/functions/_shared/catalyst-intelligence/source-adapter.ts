import type {
  CatalystSourceType,
  NormalizedEventCandidate,
  RawSourceItem,
  SourceRunContext,
} from "./types.ts";

/**
 * Provider-neutral collector contract.
 * Adapters discover and normalize. They do not score, dedupe, or
 * advance catalyst state.
 */
export interface CatalystSourceAdapter {
  readonly id: string;
  readonly sourceType: CatalystSourceType;
  discover(context: SourceRunContext): Promise<RawSourceItem[]>;
  normalize(
    item: RawSourceItem,
    context: SourceRunContext,
  ): Promise<NormalizedEventCandidate | null>;
}
