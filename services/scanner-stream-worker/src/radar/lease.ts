import { RADAR_V22_LEASE_KEY } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { FetchLike } from "../baseline/grouped.ts";

export const ACQUIRE_LEASE_RPC = "try_acquire_radar_v22_lease_v1";
export const HEARTBEAT_LEASE_RPC = "heartbeat_radar_v22_lease_v1";
export const RELEASE_LEASE_RPC = "release_radar_v22_lease_v1";

export type LeaseClient = {
  tryAcquire: (holderId: string, ttlMs: number) => Promise<boolean>;
  heartbeat: (holderId: string, ttlMs: number) => Promise<boolean>;
  release: (holderId: string) => Promise<void>;
};

async function rpcBool(
  fetchImpl: FetchLike,
  supabaseUrl: string,
  serviceRoleKey: string,
  name: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const text = await res.text();
  if (text === "true" || text === "true\n") return true;
  try {
    return JSON.parse(text) === true;
  } catch {
    return false;
  }
}

export function createLeaseClient(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): LeaseClient {
  const { supabaseUrl, serviceRoleKey, fetch: fetchImpl } = opts;
  return {
    async tryAcquire(holderId, ttlMs) {
      return await rpcBool(
        fetchImpl,
        supabaseUrl,
        serviceRoleKey,
        ACQUIRE_LEASE_RPC,
        {
          p_lease_key: RADAR_V22_LEASE_KEY,
          p_holder_id: holderId,
          p_ttl_ms: ttlMs,
        },
      );
    },
    async heartbeat(holderId, ttlMs) {
      return await rpcBool(
        fetchImpl,
        supabaseUrl,
        serviceRoleKey,
        HEARTBEAT_LEASE_RPC,
        {
          p_lease_key: RADAR_V22_LEASE_KEY,
          p_holder_id: holderId,
          p_ttl_ms: ttlMs,
        },
      );
    },
    async release(holderId) {
      try {
        await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${RELEASE_LEASE_RPC}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            p_lease_key: RADAR_V22_LEASE_KEY,
            p_holder_id: holderId,
          }),
        });
      } catch {
        // best-effort release
      }
    },
  };
}
