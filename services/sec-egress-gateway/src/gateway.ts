import { bearerAuthenticator, type GatewayAuthenticator } from "./auth.ts";
import { matchSecOperation, SEC_OPERATIONS, type SecOperation } from "./registry.ts";

export const DEFAULT_MIN_INTERVAL_MS = 240_000;
export const DEFAULT_TRANSPORT_TTL_MS = 240_000;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 8_000;

export interface GatewayOptions {
  authSecret: string | undefined;
  userAgent: string | undefined;
  nowMs?: () => number;
  fetchImpl?: typeof fetch;
  authenticator?: GatewayAuthenticator;
  minIntervalMs?: number;
  transportTtlMs?: number;
  timeoutMs?: number;
  egressIdentity?: string | null;
  log?: (event: Record<string, unknown>) => void;
}

interface CachedSuccess {
  body: string;
  contentType: string;
  storedAtMs: number;
}

interface OperationState {
  inFlight: Promise<UpstreamResult> | null;
  lastSuccess: CachedSuccess | null;
  lastUpstreamAtMs: number | null;
  lastUpstreamStatus: number | null;
  lastSuccessAtMs: number | null;
  lastRateLimitAtMs: number | null;
}

interface UpstreamResult {
  kind: "live";
  status: number;
  body: string;
  contentType: string;
  retryAfter: string | null;
  durationMs: number;
  errorCategory: string | null;
}

export function createSecEgressGateway(options: GatewayOptions) {
  const nowMs = options.nowMs ?? (() => Date.now());
  const fetchImpl = options.fetchImpl ?? fetch;
  const authenticator = options.authenticator ?? bearerAuthenticator(options.authSecret);
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const transportTtlMs = options.transportTtlMs ?? DEFAULT_TRANSPORT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const userAgent = (options.userAgent ?? "").trim();
  const operations = new Map<string, OperationState>();

  function operationState(id: string): OperationState {
    const existing = operations.get(id);
    if (existing) return existing;
    const created: OperationState = {
      inFlight: null,
      lastSuccess: null,
      lastUpstreamAtMs: null,
      lastUpstreamStatus: null,
      lastSuccessAtMs: null,
      lastRateLimitAtMs: null,
    };
    operations.set(id, created);
    return created;
  }

  function log(event: Record<string, unknown>): void {
    options.log?.({ service: "sec-egress-gateway", ...event });
  }

  async function handle(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return health(requestId);
    }

    const auth = await authenticator.authenticate(request);
    if (!auth.ok) {
      log({
        request_id: requestId,
        operation: null,
        auth_result: auth.reason,
        upstream_attempted: false,
        result_source: null,
        error_category: auth.reason === "missing" ? "unauthorized" : "forbidden",
      });
      return json(auth.status, { error: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", request_id: requestId }, requestId);
    }
    if (!userAgent) {
      log({ request_id: requestId, auth_result: "ok", upstream_attempted: false, error_category: "user_agent_unconfigured" });
      return json(503, { error: "SEC_USER_AGENT_UNCONFIGURED", request_id: requestId }, requestId);
    }

    const byPath = SEC_OPERATIONS.find((operation) => operation.path === url.pathname);
    if (byPath && byPath.method !== request.method) {
      log({ request_id: requestId, operation: byPath.id, auth_result: "ok", upstream_attempted: false, error_category: "method_not_allowed" });
      return json(405, { error: "METHOD_NOT_ALLOWED", request_id: requestId }, requestId);
    }
    const operation = matchSecOperation(request.method, url.pathname);
    if (!operation || !operation.enabled) {
      log({
        request_id: requestId,
        operation: operation?.id ?? null,
        auth_result: "ok",
        upstream_attempted: false,
        error_category: "unknown_operation",
      });
      return json(404, { error: "UNKNOWN_OPERATION", request_id: requestId }, requestId);
    }
    if (request.method !== "GET") {
      return json(405, { error: "METHOD_NOT_ALLOWED", request_id: requestId }, requestId);
    }
    return serveOperation(operation, requestId);
  }

  async function serveOperation(operation: SecOperation, requestId: string): Promise<Response> {
    const state = operationState(operation.id);
    if (state.inFlight) {
      const shared = await state.inFlight;
      log(diagnostic(requestId, operation.id, false, "live", shared));
      return upstreamResponse(shared, requestId, false);
    }

    const now = nowMs();
    const sinceUpstream = state.lastUpstreamAtMs == null ? null : now - state.lastUpstreamAtMs;
    if (sinceUpstream != null && sinceUpstream < minIntervalMs) {
      const cached = freshCache(state, now);
      if (cached) {
        log({
          request_id: requestId,
          operation: operation.id,
          auth_result: "ok",
          gateway_timestamp: new Date(now).toISOString(),
          upstream_attempted: false,
          result_source: "transport_cache",
          upstream_http_status: 200,
          response_bytes: cached.body.length,
          retry_after_present: false,
          egress_identity: options.egressIdentity ?? null,
          error_category: null,
        });
        return cachedResponse(cached, requestId);
      }
      log({
        request_id: requestId,
        operation: operation.id,
        auth_result: "ok",
        upstream_attempted: false,
        result_source: null,
        error_category: "minimum_interval",
      });
      return json(503, { error: "MINIMUM_INTERVAL", request_id: requestId }, requestId);
    }

    let publish: (result: UpstreamResult) => void = () => {};
    const flight = new Promise<UpstreamResult>((resolve) => {
      publish = resolve;
    });
    state.inFlight = flight;
    try {
      const result = await fetchUpstream(operation, state);
      publish(result);
      log(diagnostic(requestId, operation.id, true, "live", result));
      return upstreamResponse(result, requestId, true);
    } finally {
      if (state.inFlight === flight) state.inFlight = null;
    }
  }

  async function fetchUpstream(operation: SecOperation, state: OperationState): Promise<UpstreamResult> {
    const started = nowMs();
    state.lastUpstreamAtMs = started;
    try {
      const response = await fetchImpl(operation.upstreamUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": userAgent,
          "Accept": "application/atom+xml, application/xml, text/xml, application/json, text/plain",
          "Accept-Encoding": "gzip, deflate",
        },
      });
      const durationMs = Math.max(0, nowMs() - started);
      const retryAfter = response.headers.get("retry-after");
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        state.lastUpstreamStatus = response.status;
        return { kind: "live", status: 502, body: "", contentType: "application/json", retryAfter: null, durationMs, errorCategory: "upstream_redirect" };
      }
      const body = await response.text();
      state.lastUpstreamStatus = response.status;
      if (response.status === 429) {
        state.lastRateLimitAtMs = nowMs();
        return {
          kind: "live",
          status: 429,
          body,
          contentType: response.headers.get("content-type") ?? "text/plain",
          retryAfter,
          durationMs,
          errorCategory: "provider_rate_limited",
        };
      }
      if (response.status >= 500) {
        return { kind: "live", status: response.status, body: "", contentType: "application/json", retryAfter: null, durationMs, errorCategory: "upstream_http" };
      }
      if (!response.ok) {
        return { kind: "live", status: response.status, body: "", contentType: "application/json", retryAfter: null, durationMs, errorCategory: "upstream_http" };
      }
      if (!body.trim()) {
        return { kind: "live", status: 502, body: "", contentType: "application/json", retryAfter: null, durationMs, errorCategory: "upstream_invalid" };
      }
      state.lastSuccess = {
        body,
        contentType: response.headers.get("content-type") ?? "application/atom+xml",
        storedAtMs: nowMs(),
      };
      state.lastSuccessAtMs = state.lastSuccess.storedAtMs;
      return {
        kind: "live",
        status: response.status,
        body,
        contentType: state.lastSuccess.contentType,
        retryAfter: null,
        durationMs,
        errorCategory: null,
      };
    } catch (err) {
      const durationMs = Math.max(0, nowMs() - started);
      const name = (err as { name?: string } | null)?.name;
      const timedOut = name === "TimeoutError" || name === "AbortError";
      state.lastUpstreamStatus = null;
      return {
        kind: "live",
        status: timedOut ? 504 : 502,
        body: "",
        contentType: "application/json",
        retryAfter: null,
        durationMs,
        errorCategory: timedOut ? "timeout" : "upstream_network",
      };
    }
  }

  function freshCache(state: OperationState, now: number): CachedSuccess | null {
    if (!state.lastSuccess) return null;
    if (now - state.lastSuccess.storedAtMs > transportTtlMs) return null;
    return state.lastSuccess;
  }

  function health(requestId: string): Response {
    const filings = operations.get("latest-filings");
    return json(userAgent && options.authSecret ? 200 : 503, {
      ok: Boolean(userAgent && options.authSecret),
      service: "sec-egress-gateway",
      sec_user_agent_configured: Boolean(userAgent),
      gateway_auth_configured: Boolean(options.authSecret),
      egress_identity_configured: Boolean(options.egressIdentity),
      last_upstream_success_at: filings?.lastSuccessAtMs ? new Date(filings.lastSuccessAtMs).toISOString() : null,
      last_upstream_status: filings?.lastUpstreamStatus ?? null,
      last_rate_limit_at: filings?.lastRateLimitAtMs ? new Date(filings.lastRateLimitAtMs).toISOString() : null,
      request_id: requestId,
    }, requestId);
  }

  return { handle };
}

function diagnostic(
  requestId: string,
  operation: string,
  upstreamAttempted: boolean,
  resultSource: "live" | "transport_cache",
  result: UpstreamResult,
): Record<string, unknown> {
  return {
    request_id: requestId,
    operation,
    auth_result: "ok",
    upstream_attempted: upstreamAttempted,
    result_source: resultSource,
    upstream_http_status: result.status,
    upstream_duration_ms: result.durationMs,
    response_bytes: result.body.length,
    retry_after_present: result.retryAfter != null,
    retry_after: result.retryAfter,
    error_category: result.errorCategory,
  };
}

function upstreamResponse(result: UpstreamResult, requestId: string, upstreamAttempted: boolean): Response {
  if (result.status === 429) {
    const headers = metaHeaders(requestId, "live", result.status, upstreamAttempted, result.durationMs, result.body.length);
    if (result.retryAfter) headers.set("retry-after", result.retryAfter);
    headers.set("content-type", result.contentType);
    return new Response(result.body, { status: 429, headers });
  }
  if (result.status >= 200 && result.status < 300 && result.errorCategory == null) {
    const headers = metaHeaders(requestId, "live", result.status, upstreamAttempted, result.durationMs, result.body.length);
    headers.set("content-type", result.contentType);
    return new Response(result.body, { status: result.status, headers });
  }
  const status = result.status === 504 ? 504 : result.status === 502 ? 502 : result.status;
  return json(status, {
    error: result.errorCategory === "timeout"
      ? "UPSTREAM_TIMEOUT"
      : result.errorCategory === "upstream_network"
      ? "UPSTREAM_NETWORK"
      : "UPSTREAM_HTTP",
    upstream_status: result.status,
    request_id: requestId,
  }, requestId, {
    resultSource: "live",
    upstreamStatus: result.status,
    upstreamAttempted,
    durationMs: result.durationMs,
  });
}

function cachedResponse(cached: CachedSuccess, requestId: string): Response {
  const headers = metaHeaders(requestId, "transport_cache", 200, false, 0, cached.body.length);
  headers.set("content-type", cached.contentType);
  return new Response(cached.body, { status: 200, headers });
}

function metaHeaders(
  requestId: string,
  resultSource: "live" | "transport_cache",
  upstreamStatus: number,
  upstreamAttempted: boolean,
  durationMs: number,
  bytes: number,
): Headers {
  return new Headers({
    "x-stocksist-request-id": requestId,
    "x-stocksist-result-source": resultSource,
    "x-stocksist-upstream-status": String(upstreamStatus),
    "x-stocksist-upstream-attempted": upstreamAttempted ? "true" : "false",
    "x-stocksist-upstream-duration-ms": String(durationMs),
    "x-stocksist-response-bytes": String(bytes),
    "cache-control": "no-store",
  });
}

function json(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
  meta?: { resultSource: "live" | "transport_cache"; upstreamStatus: number; upstreamAttempted: boolean; durationMs: number },
): Response {
  const headers = meta
    ? metaHeaders(requestId, meta.resultSource, meta.upstreamStatus, meta.upstreamAttempted, meta.durationMs, 0)
    : new Headers({ "x-stocksist-request-id": requestId, "cache-control": "no-store" });
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}
