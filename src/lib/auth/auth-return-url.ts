import { sanitizeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";

export function currentReturnPath(location: {
  pathname: string;
  search?: string;
}): string {
  const search = location.search ?? "";
  return sanitizeAuthRedirectPath(`${location.pathname}${search}`);
}

export function buildLoginPath(returnPath: string = "/dashboard"): string {
  const safe = sanitizeAuthRedirectPath(returnPath);
  return `/login?next=${encodeURIComponent(safe)}`;
}

export function buildSignupPath(returnPath: string = "/dashboard"): string {
  const safe = sanitizeAuthRedirectPath(returnPath);
  return `/signup?next=${encodeURIComponent(safe)}`;
}

/** Dashboard destination for guests wraps login with preserved `next`. */
export function authGatedHref(
  destinationPath: string,
  authenticated: boolean,
): string {
  const safe = sanitizeAuthRedirectPath(destinationPath);
  return authenticated ? safe : buildLoginPath(safe);
}
