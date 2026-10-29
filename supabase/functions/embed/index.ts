// Embeds a chat question with gte-small, the model scripts/embed.py used for the chunks
// (mean pool + L2 normalise, 384 dims), so questions and chunks share one vector space.
// POST {"input": "..."} with the user's access token -> {"embedding": number[384]}.
// Only logged-in IITR users may call it, so nobody else can spend our free invocations.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const MAX_CHARS = 500;
const session = new Supabase.ai.Session("gte-small");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Same rule as isAllowedSession() in lib/auth.ts (Deno can't import it). Keep the two in sync.
const ALLOWED_EMAIL = /@([a-z0-9-]+\.)*iitr\.ac\.in$/i;

type Claims = {
  email?: string;
  app_metadata?: { providers?: string[] };
  amr?: (string | { method?: string })[];
};

function isAllowedSession(claims: Claims): boolean {
  const viaGoogle = claims.app_metadata?.providers?.includes("google") ?? false;
  const viaOAuth = (Array.isArray(claims.amr) ? claims.amr : []).some(
    (entry) => (typeof entry === "string" ? entry : entry?.method) === "oauth",
  );
  return viaGoogle && viaOAuth && !!claims.email && ALLOWED_EMAIL.test(claims.email);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return json({ error: "Missing token" }, 401);
  // getClaims verifies the token's signature before we trust anything in it.
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return json({ error: "Invalid token" }, 401);
  if (!isAllowedSession(data.claims as Claims)) return json({ error: "IITR login required" }, 403);

  let input: unknown;
  try {
    input = (await req.json())?.input;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  if (typeof input !== "string" || !input.trim() || input.length > MAX_CHARS) {
    return json({ error: `input must be 1-${MAX_CHARS} characters` }, 400);
  }

  const embedding = await session.run(input, { mean_pool: true, normalize: true });
  return json({ embedding });
});
