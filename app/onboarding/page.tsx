import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import StatusNote from "@/components/StatusNote";
import OnboardingForm from "@/components/careers/OnboardingForm";
import { loadProfile } from "@/lib/careers/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return (
    <div className="page-container max-w-3xl space-y-6 py-8">
      <PageHeader
        title="Set up your profile"
        intro="A few quick questions. PathIITR compares your answers with what each career track expects and suggests where you fit best. You can change them any time."
      />
      <Suspense fallback={<StatusNote kind="loading">Loading your profile…</StatusNote>}>
        <ProfileForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Prefills the form when the student is editing an existing profile.
async function ProfileForm({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const profile = await loadProfile(await createClient());
  const { from } = await searchParams;
  return <OnboardingForm initial={profile} fromProfile={from === "profile"} />;
}
