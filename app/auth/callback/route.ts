import { NextResponse, type NextRequest } from "next/server";
import { isAllowedSession, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Google sends the user back here (via Supabase) with a one-time code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=failed", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?auth_error=failed", origin));
  }

  // Check the verified token claims, not just the returned user object.
  const { data: claimsData } = await supabase.auth.getClaims(data.session.access_token);
  if (!claimsData || !isAllowedSession(claimsData.claims)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?auth_error=domain", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
