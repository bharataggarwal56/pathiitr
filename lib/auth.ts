import type { JwtPayload } from "@supabase/supabase-js";

// Only IIT Roorkee Google accounts may sign in: @iitr.ac.in or a department subdomain
// such as @ece.iitr.ac.in.
const ALLOWED_EMAIL = /@([a-z0-9-]+\.)*iitr\.ac\.in$/i;

export function isAllowedEmail(email?: string | null): boolean {
  return !!email && ALLOWED_EMAIL.test(email);
}

// A session is allowed only if Google vouched for the email: the account is linked to Google
// and this session was created by OAuth (not, say, an email/password sign-up).
export function isAllowedSession(claims: JwtPayload): boolean {
  const viaGoogle = claims.app_metadata?.providers?.includes("google") ?? false;
  const viaOAuth = (claims.amr ?? []).some(
    (entry) => (typeof entry === "string" ? entry : entry.method) === "oauth",
  );
  return viaGoogle && viaOAuth && isAllowedEmail(claims.email);
}

// Where to send the user after login. Only same-site paths, so `next` can't be an open redirect.
export function safeNext(path?: string | null): string {
  if (path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")) {
    return path;
  }
  return "/chat";
}
