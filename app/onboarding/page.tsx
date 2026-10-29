import type { Metadata } from "next";
import { Suspense } from "react";
import OnboardingForm from "@/components/careers/OnboardingForm";
import { loadProfile } from "@/lib/careers/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your profile | PathIITR" };

export default function OnboardingPage() {
  return (
    <div className="page-container max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Your profile</h1>
        <p className="mt-2 text-muted">
          A few quick questions. PathIITR compares your answers with what each career track expects and
          suggests where you fit best. You can change them any time.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading your profile...</p>}>
        <ProfileForm />
      </Suspense>
    </div>
  );
}

// Prefills the form when the student is editing an existing profile.
async function ProfileForm() {
  const profile = await loadProfile(await createClient());
  return <OnboardingForm initial={profile} />;
}
