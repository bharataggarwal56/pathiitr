"use client";

import Link from "next/link";
import { LogIn, MessageSquareText } from "lucide-react";
import { signInWithGoogle, useAuthEmail } from "@/components/AuthButton";

const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-navy shadow-sm transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Landing-page primary button: sign in when signed out, go to chat when signed in.
export default function HeroCta() {
  const { email } = useAuthEmail();

  if (email) {
    return (
      <Link href="/chat" className={PRIMARY}>
        <MessageSquareText className="size-5" aria-hidden />
        Ask PathIITR
      </Link>
    );
  }

  return (
    <button onClick={() => signInWithGoogle()} className={PRIMARY}>
      <LogIn className="size-5" aria-hidden />
      Sign in with your IITR account
    </button>
  );
}
