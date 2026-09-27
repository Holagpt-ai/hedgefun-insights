export interface ShadowRuntimeLogger {
  info(event: string, payload: Record<string, unknown>): void;
  error(event: string, payload: Record<string, unknown>): void;
}

const FORBIDDEN_LOG_KEYS = ["apiKey", "apiSecret", "serviceRole", "authorization", "token", "chainOfThought"];

export function sanitizeShadowLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_LOG_KEYS.includes(key)) continue;
    next[key] = value;
  }
  return next;
}

export function createSilentShadowLogger(): ShadowRuntimeLogger {
  return {
    info() {},
    error() {},
  };
}

export function createConsoleShadowLogger(): ShadowRuntimeLogger {
  return {
    info(event, payload) {
      console.info(JSON.stringify({ event, ...sanitizeShadowLogPayload(payload) }));
    },
    error(event, payload) {
      console.error(JSON.stringify({ event, ...sanitizeShadowLogPayload(payload) }));
    },
  };
}
