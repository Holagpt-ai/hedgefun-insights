import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { buildOpsSnapshot, type OpsSnapshot } from "@/lib/ops/snapshot";
import {
  frontendBuildSha,
  loadAttestations,
  readEdgeRuntimeLogs,
  readRadarFeedState,
  readScannerDiagnostics,
  readScreenerFeedState,
  readSourceSync,
} from "@/lib/ops/sources";

/** Single-row Supabase reads: conservative 60 s refresh. */
const DB_REFRESH_MS = 60_000;
/** Unauthenticated GitHub API allows 60 req/h per IP; 4 calls per read. */
const GITHUB_REFRESH_MS = 15 * 60_000;

export function useOperationsSnapshot(): {
  snapshot: OpsSnapshot | null;
  loading: boolean;
  refetch: () => void;
  refreshing: boolean;
} {
  const feed = useQuery({
    queryKey: ["ops", "screener_feed_state"],
    queryFn: readScreenerFeedState,
    refetchInterval: DB_REFRESH_MS,
    staleTime: DB_REFRESH_MS / 2,
  });
  const radar = useQuery({
    queryKey: ["ops", "radar_v22_feed_state"],
    queryFn: readRadarFeedState,
    refetchInterval: DB_REFRESH_MS,
    staleTime: DB_REFRESH_MS / 2,
  });
  // Batch 213 admin RPC: bounded (≤10 jobs + ±2-week calendar window), 60 s.
  const diagnostics = useQuery({
    queryKey: ["ops", "scanner_diagnostics"],
    queryFn: () => readScannerDiagnostics(),
    refetchInterval: DB_REFRESH_MS,
    staleTime: DB_REFRESH_MS / 2,
  });
  const edgeLogs = useQuery({ queryKey: ["ops", "edge_logs"], queryFn: readEdgeRuntimeLogs, staleTime: Infinity });
  const sync = useQuery({
    queryKey: ["ops", "source_sync"],
    queryFn: () => readSourceSync(),
    refetchInterval: GITHUB_REFRESH_MS,
    staleTime: GITHUB_REFRESH_MS,
    refetchOnWindowFocus: false,
  });

  // Re-evaluate ages against the wall clock between fetches.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const attestations = useMemo(() => loadAttestations(), []);
  const buildSha = useMemo(() => frontendBuildSha(), []);

  const snapshot = useMemo(() => {
    if (!feed.data || !radar.data || !diagnostics.data || !edgeLogs.data || !sync.data) return null;
    return buildOpsSnapshot({
      nowMs,
      feedState: feed.data,
      radarFeed: radar.data,
      diagnostics: diagnostics.data,
      edgeLogs: edgeLogs.data,
      sourceSync: sync.data,
      attestations,
      frontendBuildSha: buildSha,
    });
  }, [feed.data, radar.data, diagnostics.data, edgeLogs.data, sync.data, attestations, buildSha, nowMs]);

  return {
    snapshot,
    loading: snapshot === null,
    refreshing: feed.isFetching || radar.isFetching || diagnostics.isFetching || sync.isFetching,
    refetch: () => {
      setNowMs(Date.now());
      void feed.refetch();
      void radar.refetch();
      void diagnostics.refetch();
    },
  };
}
