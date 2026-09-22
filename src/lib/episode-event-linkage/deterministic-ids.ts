import { createHash } from "node:crypto";
import type { SecurityId } from "@/types/security-identity";

function hashToUuidV4Like(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function corporateEventIdFromDedupeKey(dedupeKey: string): string {
  return hashToUuidV4Like(`corporate-event-v1:${dedupeKey}`);
}

export function eventReactionLinkId(episodeId: string, eventId: string): string {
  return hashToUuidV4Like(`event-reaction-link-v1:${episodeId}:${eventId}`);
}

export function isSecurityId(value: string): value is SecurityId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
