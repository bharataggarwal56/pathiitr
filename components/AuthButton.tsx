"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Starts Google login. `next` is where to land after a successful login.
export async function signInWithGoogle(next = "/chat") {
  const supabase = createClient();
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    // select_account lets a rejected user pick a different Google account next time.
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
}

// The signed-in user's email (null when signed out). `ready` is false until the first check finishes.
export function useAuthEmail() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { email, ready };
}

// Header control: "Sign in" when signed out, email + "Sign out" when signed in.
export default function AuthButton() {
  const router = useRouter();
  const { email, ready } = useAuthEmail();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!ready) return <div className="h-8 w-20" aria-hidden />;

  if (!email) {
    return (
      <button
        onClick={() => signInWithGoogle()}
        className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-accent-light"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-48 truncate text-white/75 sm:inline" title={email}>
        {email}
      </span>
      <button
        onClick={signOut}
        className="rounded-md border border-white/30 px-3 py-1.5 text-white hover:bg-navy-light"
      >
        Sign out
      </button>
    </div>
  );
}
