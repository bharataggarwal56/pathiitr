import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import StatusNote from "@/components/StatusNote";
import NoProfile from "@/components/careers/NoProfile";
import Recommendations from "@/components/careers/Recommendations";
import { currentRecommendation, loadMatrix, loadProfile } from "@/lib/careers/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Careers" };

export default function CareersPage() {
  return (
    <div className="page-container space-y-6 py-8">
      <PageHeader
        title="Your career matches"
        intro="Each track is scored against the skills seniors say it needs, your interests and the tracks you picked. These are suggestions to explore, not verdicts."
      />
      <Suspense fallback={<StatusNote kind="loading">Working out your matches…</StatusNote>}>
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
