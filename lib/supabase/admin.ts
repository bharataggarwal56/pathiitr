import "server-only";
import { createClient } from "@supabase/supabase-js";

// Supabase client with the secret key: bypasses RLS. Server code only (route handlers, server
// actions) for tables no user may touch directly, such as llm_cache. Never import from a client
// component; the server-only import above makes the build fail if that happens.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
