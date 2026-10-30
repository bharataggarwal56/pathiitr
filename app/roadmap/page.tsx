import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Info, Pencil } from "lucide-react";
import NoProfile from "@/components/careers/NoProfile";
import PrintButton from "@/components/roadmap/PrintButton";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { currentRecommendation, loadMatrix, loadProfile } from "@/lib/careers/profile";
import { buildRoadmap, currentTerm, type CoreCourse, type RoadmapElective, type Semester, type Slot } from "@/lib/careers/roadmap";
import { skillAnchor } from "@/lib/careers/skillgap";
import { trackSkillStatus, type SkillStatus } from "@/lib/careers/skills";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roadmap | PathIITR" };

type Props = { searchParams: Promise<{ track?: string | string[] }> };

export default function RoadmapPage({ searchParams }: Props) {
  return (
    <div className="page-container space-y-6 py-8 print:py-0">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Your semester roadmap</h1>
        <p className="mt-2 max-w-2xl text-muted">
          From this semester to graduation: the curriculum&apos;s courses and elective slots, electives that fit your
          track, and the skills from your gap list to work on each semester.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Building your roadmap...</p>}>
        <Roadmap searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Roadmap({ searchParams }: Props) {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const asked = (await searchParams).track;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) return <NoProfile />;
  if (!profile.studyYear) return <EditProfile text="Add your year of study to your profile to see a roadmap." />;

  const rows = await loadMatrix(supabase);
  const topTrack = (await currentRecommendation(supabase, profile, rows)).top[0]?.track ?? TRACKS[0];
  const track = TRACKS.includes(asked as Track) ? (asked as Track) : topTrack;
  const isEce = profile.branch === "ECE";

  const [core, electives, slots] = await Promise.all([
    supabase.from("courses").select("code, name, credits, year, semester").eq("category", "core"),
    supabase
      .from("courses")
      .select("code, name, credits, elective_group, lists, tracks_helped, track_reason, offered")
      .eq("category", "elective"),
    supabase.from("curriculum_slots").select("slot, name, year, semester, credits"),
  ]);
  if (core.error || electives.error || slots.error) {
    return <p className="text-muted">Couldn&apos;t load the curriculum right now. Please try again shortly.</p>;
  }

  const current = currentTerm(profile.studyYear, new Date());
  const plan = buildRoadmap({
    current,
    track,
    // Other branches get the skill plan only: the curriculum we have is ECE's.
    coreCourses: isEce ? (core.data as CoreCourse[]) : [],
    slots: isEce ? (slots.data as Slot[]) : [],
    electives: electives.data as RoadmapElective[],
    statuses: trackSkillStatus(track, rows, profile.skillLevels),
  });

  return (
    <div className="space-y-6">
      <nav aria-label="Tracks" className="flex flex-wrap gap-2 print:hidden">
        {TRACKS.map((t) => (
          <Link
            key={t}
            href={`/roadmap?track=${encodeURIComponent(t)}`}
            aria-current={t === track ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              t === track ? "border-navy bg-navy text-white" : "border-slate-300 bg-surface text-navy hover:border-brand"
            }`}
          >
            {t}
            {t === topTrack && <span className={t === track ? "text-accent-light" : "text-muted"}> · top match</span>}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">
          Track: <strong className="text-navy">{track}</strong>
          <span className="text-muted"> · from Year {current.year} {current.semester}</span>
        </p>
        <PrintButton />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
        {isEce
          ? "Track suggestions are based on course titles; syllabi weren't available."
          : "Course plan is available for ECE only (that's the curriculum we have). The skill plan below still applies."}
      </p>

      {plan.length === 0 ? (
        <p className="text-muted">No semesters left in the curriculum we have (it covers years 1 to 4).</p>
      ) : (
        <ol className="space-y-4">
          {plan.map((s) => (
            <SemesterCard key={`${s.year}-${s.semester}`} semester={s} track={track} showCourses={isEce} />
          ))}
        </ol>
      )}

      <p className="hidden text-xs text-muted print:block">Generated by PathIITR from the official curriculum and your profile.</p>
      <div className="print:hidden">
        <EditProfile text="Plan looks off? Update your year or skill ratings." />
      </div>
    </div>
  );
}

function SemesterCard({ semester: s, track, showCourses }: { semester: Semester; track: Track; showCourses: boolean }) {
  return (
    <li
      className={`break-inside-avoid rounded-xl border bg-surface p-4 shadow-sm print:shadow-none sm:p-5 ${
        s.isCurrent ? "border-brand ring-1 ring-brand/30" : "border-slate-200"
      }`}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
        Year {s.year} · {s.semester}
        {s.isCurrent && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-navy">Now</span>}
      </h2>
      <div className={`mt-3 grid gap-5 ${showCourses ? "sm:grid-cols-2" : ""}`}>
        {showCourses && (
          <div className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold text-brand">Core courses</h3>
              {s.coreCourses.length ? (
                <ul className="mt-1.5 space-y-1 text-sm">
                  {s.coreCourses.map((c) => (
                    <li key={c.code} className="flex justify-between gap-3">
                      <span>
                        <span className="font-mono text-xs text-muted">{c.code}</span> {c.name}
                      </span>
                      <span className="shrink-0 text-muted">{c.credits} cr</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-muted">No core courses listed this semester.</p>
              )}
            </section>
            {s.slots.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-brand">Elective slots</h3>
                <ul className="mt-1.5 space-y-3 text-sm">
                  {s.slots.map((slot) => (
                    <li key={slot.slot} className={slot.optional ? "text-muted" : ""}>
                      <p className="flex justify-between gap-3">
                        <span>
                          <span className="font-mono text-xs text-muted">{slot.slot}</span> {slot.name}
                        </span>
                        <span className="shrink-0 text-muted">{slot.credits} cr</span>
                      </p>
                      {slot.note && <p className="mt-0.5 text-xs text-muted">{slot.note}</p>}
                      {!slot.note &&
                        (slot.suggestions.length ? (
                          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Suggested for ${track}`}>
                            {slot.suggestions.map((c) => (
                              <li key={c.code} className="rounded bg-brand-tint px-1.5 py-0.5 text-xs text-navy" title={c.track_reason ?? undefined}>
                                <span className="font-mono">{c.code}</span> {c.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted">
                            No elective here is linked to {track} by its title.{" "}
                            <Link href={`/electives?track=${encodeURIComponent(track)}`} className="text-brand hover:underline print:hidden">
                              See all electives
                            </Link>
                          </p>
                        ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        <section>
          <h3 className="text-sm font-semibold text-brand">Skills to focus on</h3>
          {s.skills.length ? (
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {s.skills.map((k) => (
                <SkillItem key={k.skill} skill={k} track={track} />
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted">No new skills planned. Practise and build on what you have.</p>
          )}
        </section>
      </div>
    </li>
  );
}

function SkillItem({ skill: k, track }: { skill: SkillStatus; track: Track }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <Link href={`/skill-gap?track=${encodeURIComponent(track)}#${skillAnchor(k.skill)}`} className="text-ink hover:text-brand hover:underline">
        {k.skill}
        <span className="text-muted"> · {k.level === "core" ? "core" : "nice to have"}</span>
      </Link>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
          k.status === "missing" ? "border border-slate-400 text-muted" : "bg-accent text-navy"
        }`}
      >
        {k.status === "missing" ? "Missing" : "Partly"}
      </span>
    </li>
  );
}

function EditProfile({ text }: { text: string }) {
  return (
    <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
      {text}
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 font-medium text-navy hover:border-brand"
      >
        <Pencil className="size-4" aria-hidden />
        Edit your profile
      </Link>
    </p>
  );
}
