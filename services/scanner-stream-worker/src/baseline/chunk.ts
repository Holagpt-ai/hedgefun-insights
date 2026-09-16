/** Byte-size + item-count chunking for staged 52-week baseline publication. */

export const STAGED_CHUNK_TARGET_BYTES = 512 * 1024;
export const STAGED_CHUNK_SAFETY_BYTES = 1024 * 1024;
/** Matches append RPC `v_len > 2000` in the chunked-publish migration. */
export const STAGED_CHUNK_MAX_ITEMS = 2000;

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

export function serializedRequestBytes(body: Record<string, unknown>): number {
  return utf8ByteLength(JSON.stringify(body));
}

export type ChunkItemsResult<T> =
  | { ok: true; chunks: T[][] }
  | { ok: false; code: "row_exceeds_safety_ceiling" };

function resolveMaxItems(maxItems: number | undefined): number {
  const value = maxItems ?? STAGED_CHUNK_MAX_ITEMS;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("invalid staged chunk maxItems");
  }
  return value;
}

/**
 * Pack items so each wrapped JSON request stays at or under targetBytes
 * and never exceeds maxItems. Byte packing cannot override the item cap.
 * A single item may exceed the target if it still fits under safetyBytes.
 * One item above the safety ceiling fails closed.
 */
export function chunkItemsByRequestBytes<T>(
  items: readonly T[],
  wrap: (chunk: T[]) => Record<string, unknown>,
  opts?: { targetBytes?: number; safetyBytes?: number; maxItems?: number },
): ChunkItemsResult<T> {
  const targetBytes = opts?.targetBytes ?? STAGED_CHUNK_TARGET_BYTES;
  const safetyBytes = opts?.safetyBytes ?? STAGED_CHUNK_SAFETY_BYTES;
  const maxItems = resolveMaxItems(opts?.maxItems);
  if (items.length === 0) return { ok: true, chunks: [] };

  const measure = (chunk: T[]) => serializedRequestBytes(wrap(chunk));
  const chunks: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    const solo = measure([item]);
    if (solo > safetyBytes) {
      return { ok: false, code: "row_exceeds_safety_ceiling" };
    }
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    if (
      current.length >= maxItems ||
      measure([...current, item]) > targetBytes
    ) {
      chunks.push(current);
      current = [item];
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) chunks.push(current);
  return { ok: true, chunks };
}
