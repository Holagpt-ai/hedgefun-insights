/**
 * Client identity for public market-data quota.
 *
 * Supabase Edge does not document a sanitized client IP. `x-forwarded-for`
 * and `x-real-ip` are caller-settable, so they are ignored.
 *
 * `cf-connecting-ip` is accepted only as a single public IP. Cloudflare
 * rejects a client-supplied CF-Connecting-IP before the function runs, so a
 * value that reaches this code was written by the edge. A missing or
 * non-public value stays unverified — per-IP limits are then skipped, and
 * the global Massive quota still applies.
 */

export type MarketDataClientIdentity =
  | { status: "verified"; ip: string; source: "cf-connecting-ip" }
  | { status: "unverified"; reason: "absent" | "invalid_or_private" };

export function resolveMarketDataClientIdentity(req: Request): MarketDataClientIdentity {
  const raw = req.headers.get("cf-connecting-ip");
  if (raw == null || raw.trim() === "") return { status: "unverified", reason: "absent" };
  const ip = raw.trim();
  if (!isPublicIp(ip)) return { status: "unverified", reason: "invalid_or_private" };
  return { status: "verified", ip, source: "cf-connecting-ip" };
}

function isPublicIp(ip: string): boolean {
  if (ip.length > 64 || ip.includes(",") || /\s/.test(ip)) return false;
  if (ip.includes(".")) return isPublicIpv4(ip);
  if (ip.includes(":")) return isPublicIpv6(ip);
  return false;
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) return false;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
    nums.push(n);
  }
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && nums[2] === 2) return false;
  if (a === 198 && b === 51 && nums[2] === 100) return false;
  if (a === 203 && b === 0 && nums[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  if (ip.length > 39 || ip.includes("%") || ip.includes(".")) return false;
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  const halves = lower.split("::");
  if (halves.length > 2) return false;
  const groups = lower.split(":").filter((group) => group.length > 0);
  if (halves.length === 1 && groups.length !== 8) return false;
  if (halves.length === 2 && (groups.length < 1 || groups.length > 7)) return false;
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return false;
  const first = parseInt(groups[0] ?? "0", 16);
  if (first >= 0xfe80 && first <= 0xfebf) return false;
  if (first >= 0xfc00 && first <= 0xfdff) return false;
  if (first >= 0xff00) return false;
  return true;
}
