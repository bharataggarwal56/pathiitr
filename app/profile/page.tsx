import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pencil } from "lucide-react";
import NoProfile from "@/components/careers/NoProfile";
import DataControls from "@/components/profile/DataControls";
import { BRANCHES, INTERESTS } from "@/lib/careers/interests";
import { currentRecommendation, loadMatrix, loadProfile, type Profile } from "@/lib/careers/profile";
import { SKILL_AREAS, SKILL_GROUPS, SKILL_LEVELS } from "@/lib/careers/skills";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile | PathIITR" };

export default function ProfilePage() {
  return (
    <div className="page-container max-w-3xl space-y-6 py-8">
      <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Your profile</h1>
      <Suspense fallback={<p className="text-muted">Loading your profile...</p>}>
        <ProfileSummary />
      </Suspense>
    </div>
  );
}

async function ProfileSummary() {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) return <NoProfile />;
  const { top } = await currentRecommendation(supabase, profile, await loadMatrix(supabase));

  return (
    <>
      <Card
        title="About you"
        action={
          <Link
            href="/onboarding?from=profile"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-navy shadow-sm hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Pencil className="size-4" aria-hidden />
            Edit profile
          </Link>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Year</dt>
          <dd>{profile.studyYear ? `Year ${profile.studyYear}` : "Not set"}</dd>
          <dt className="text-muted">Branch</dt>
          <dd>{BRANCHES.find((b) => b.code === profile.branch)?.label ?? "Not set"}</dd>
        </dl>
        {profile.updatedAt && <p className="mt-3 text-xs text-muted">Last updated {formatDate(profile.updatedAt)}</p>}
      </Card>

      <Card title="Interests">
        <Chips items={profile.interests.map((id) => INTERESTS.find((i) => i.id === id)?.label ?? id)} />
      </Card>

      <Card title="Target tracks">
        <Chips items={profile.targetTracks} empty="None picked" />
      </Card>

      <Card title="Skill ratings">
        <div className="space-y-4">
          {SKILL_GROUPS.map((group) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-navy">{group}</h3>
              <ul className="mt-1 divide-y divide-slate-100">
                {SKILL_AREAS.filter((a) => a.group === group).map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                    <span>{a.label}</span>
                    <Level value={profile.skillLevels[a.id] ?? 0} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Top 3 tracks right now">
        <ol className="space-y-2 text-sm">
          {top.slice(0, 3).map((t, i) => (
            <li key={t.track} className="flex items-baseline justify-between gap-4">
              <span>
                <span className="mr-2 font-semibold text-brand">{i + 1}.</span>
                {t.track}
              </span>
              <span className="text-muted">{t.score}% match</span>
            </li>
          ))}
        </ol>
        <Link href="/careers" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
          See why
        </Link>
      </Card>

      <Card title="Your data">
        <p className="mb-3 text-sm text-muted">
          Everything here is yours alone.{" "}
          <Link href="/privacy" className="font-medium text-brand hover:underline">
            Privacy
          </Link>
        </p>
        <DataControls />
      </Card>
    </>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function Level({ value }: { value: Profile["skillLevels"][string] }) {
  const label = SKILL_LEVELS.find((l) => l.value === value)?.label ?? "None";
  const tone = value === 0 ? "border border-slate-300 text-muted" : value === 1 ? "bg-brand-tint text-brand" : value === 2 ? "bg-brand text-white" : "bg-navy text-white";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

function Chips({ items, empty = "None picked" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-brand-tint px-3 py-1 text-sm text-navy">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
