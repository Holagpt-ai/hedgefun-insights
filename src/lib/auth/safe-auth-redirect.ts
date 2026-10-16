const DEFAULT_AUTH_REDIRECT = "/dashboard";

const AUTH_ENTRY_PREFIXES = [
  "/login",
  "/signup",
  "/register",
  "/sign-up",
  "/reset-password",
] as const;

function normalizeIncomingPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/");
}

function isAuthEntryLoop(pathname: string): boolean {
  return AUTH_ENTRY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Same-origin post-auth redirect sanitizer shared by auth routes and modals.
 */
export function sanitizeAuthRedirectPath(
  path: string | null | undefined,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  if (path == null || path === "") return fallback;
  if (path.includes("\\")) return fallback;

  const normalized = normalizeIncomingPath(path);
  if (!normalized.startsWith("/")) return fallback;
  if (normalized.startsWith("//")) return fallback;
  if (/^\/[a-zA-Z][a-zA-Z\d+\-.]*:/.test(normalized)) return fallback;

  const qIndex = normalized.indexOf("?");
  const pathname = qIndex === -1 ? normalized : normalized.slice(0, qIndex);
  const search = qIndex === -1 ? "" : normalized.slice(qIndex);

  if (isAuthEntryLoop(pathname)) return fallback;

  return `${pathname}${search}`;
}
