import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedSession } from "@/lib/auth";

// Pages anyone can see. Everything else needs an IITR login.
function isPublicPath(pathname: string) {
  return pathname === "/" || pathname === "/privacy" || pathname.startsWith("/auth/");
}

// Refreshes the Supabase auth session cookie on every matched request
// and keeps non-IITR or signed-out users away from protected pages.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // No-cache headers so a CDN never serves one user's session cookie to another.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Must run before anything else so a refreshed token can still be written to the response.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // Redirect while keeping any cookies Supabase just set (refreshed or cleared session).
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Safety net: the callback already rejects these, but never keep a non-IITR session.
  if (claims && !isAllowedSession(claims)) {
    await supabase.auth.signOut();
    return redirectTo("/?auth_error=domain");
  }

  const { pathname, search } = request.nextUrl;
  if (!claims && !isPublicPath(pathname)) {
    const next = encodeURIComponent(pathname + search);
    return redirectTo(`/?auth_error=login&next=${next}`);
  }

  return response;
}
