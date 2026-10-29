import Link from "next/link";
import { Compass } from "lucide-react";

// Shown on pages that need the onboarding profile when the student hasn't filled it in yet.
export default function NoProfile() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-slate-200 bg-surface p-6 shadow-sm">
      <Compass className="size-8 text-brand" aria-hidden />
      <div>
        <h2 className="text-lg font-semibold text-navy">Tell us about yourself first</h2>
        <p className="mt-1 text-muted">
          Takes about two minutes: your year, branch, interests and how comfortable you are with key skills.
        </p>
      </div>
      <Link
        href="/onboarding"
        className="rounded-lg bg-accent px-5 py-3 font-semibold text-navy shadow-sm transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Set up your profile
      </Link>
    </div>
  );
}
