// Only IIT Roorkee Google accounts may sign in: @iitr.ac.in or a department subdomain
// such as @ece.iitr.ac.in.
const ALLOWED_EMAIL = /@([a-z0-9-]+\.)*iitr\.ac\.in$/i;

export function isAllowedEmail(email?: string | null): boolean {
  return !!email && ALLOWED_EMAIL.test(email);
}

// Where to send the user after login. Only same-site paths, so `next` can't be an open redirect.
export function safeNext(path?: string | null): string {
  if (path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")) {
    return path;
  }
  return "/chat";
}
