"use client";

import Link from "next/link";
import { LogIn, MessageSquareText } from "lucide-react";
import { signInWithGoogle, useAuthEmail } from "@/components/AuthButton";

const PRIMARY = "btn-primary btn-lg";

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
