"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

// Header control: "Sign in" when signed out, an account menu (initial circle) when signed in.
export default function AuthButton() {
  const router = useRouter();
  const { email, ready } = useAuthEmail();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on outside tap/click and Escape (the Profile link closes it itself).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!ready) return <div className="size-9" aria-hidden />;

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

  const item = "block w-full px-4 py-3 text-left text-sm text-ink hover:bg-brand-tint";
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full bg-accent text-base font-semibold uppercase text-navy ring-2 ring-white/30 hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {email[0]}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-lg">
          <p className="truncate border-b border-slate-100 px-4 py-2.5 text-xs text-muted" title={email}>
            {email}
          </p>
          <Link href="/profile" role="menuitem" className={item} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <button role="menuitem" onClick={signOut} className={`${item} border-t border-slate-100`}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
