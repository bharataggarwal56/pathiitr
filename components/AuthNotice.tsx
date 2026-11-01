"use client";

import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { signInWithGoogle } from "@/components/AuthButton";

const MESSAGES: Record<string, string> = {
  domain:
    "Only IIT Roorkee Google accounts (ending in iitr.ac.in, including department addresses like ece.iitr.ac.in) can use PathIITR. You have been signed out. Please sign in with your institute account.",
  login: "Please sign in with your IITR Google account to continue.",
  failed: "Sign-in didn't complete. Please try again.",
};

// Landing-page banner explaining why the user was sent back here.
export default function AuthNotice() {
  const params = useSearchParams();
  const message = MESSAGES[params.get("auth_error") ?? ""];
  if (!message) return null;

  const next = safeNext(params.get("next"));

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border-l-4 border-accent bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-ink">{message}</p>
      <button
        onClick={() => signInWithGoogle(next)}
        className="btn-primary shrink-0"
      >
        Sign in with Google
      </button>
    </div>
  );
}
