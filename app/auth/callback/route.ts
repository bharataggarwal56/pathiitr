import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, safeNext } from "@/lib/auth";
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

  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?auth_error=domain", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
