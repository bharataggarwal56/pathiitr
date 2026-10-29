import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import NoProfile from "@/components/careers/NoProfile";
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
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) return <NoProfile />;
  const recommendation = await currentRecommendation(supabase, profile, await loadMatrix(supabase));
  return <Recommendations recommendation={recommendation} />;
}
