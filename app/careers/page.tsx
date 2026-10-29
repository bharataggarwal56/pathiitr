import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Compass } from "lucide-react";
import Recommendations from "@/components/careers/Recommendations";
import { currentRecommendation, loadMatrix, loadProfile } from "@/lib/careers/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Careers | PathIITR" };

export default function CareersPage() {
  return (
    <div className="page-container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Your career matches</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Each track is scored against the skills seniors say it needs, your interests and the tracks you
          picked. These are suggestions to explore, not verdicts.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Working out your matches...</p>}>
        <Matches />
      </Suspense>
    </div>
  );
}

async function Matches() {
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) return <NoProfile />;
  const recommendation = await currentRecommendation(supabase, profile, await loadMatrix(supabase));
  return <Recommendations recommendation={recommendation} />;
}

function NoProfile() {
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
