import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import NoProfile from "@/components/careers/NoProfile";
import Priorities from "@/components/skill-gap/Priorities";
import ScrollToSkill from "@/components/skill-gap/ScrollToSkill";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { currentRecommendation, loadMatrix, loadProfile } from "@/lib/careers/profile";
import { SKILL_GAP_VERSION, gapInputHash, skillAnchor } from "@/lib/careers/skillgap";
import { SKILL_LEVELS, trackSkillStatus, type SkillStatus } from "@/lib/careers/skills";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Skill gap | PathIITR" };

type Props = { searchParams: Promise<{ track?: string | string[] }> };

export default function SkillGapPage({ searchParams }: Props) {
  return (
    <div className="page-container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Your skill gap</h1>
        <p className="mt-2 max-w-2xl text-muted">
          The skills seniors list for a track, checked against the ratings in your profile, with the resources
          from their documents.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Checking your skills...</p>}>
        <Gap searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Gap({ searchParams }: Props) {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const asked = (await searchParams).track;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  if (!profile) return <NoProfile />;

  const rows = await loadMatrix(supabase);
  const topTrack = (await currentRecommendation(supabase, profile, rows)).top[0]?.track ?? TRACKS[0];
  const track = TRACKS.includes(asked as Track) ? (asked as Track) : topTrack;

  const skills = trackSkillStatus(track, rows, profile.skillLevels);
  const inputHash = gapInputHash(track, skills, profile.studyYear);
  const stored = profile.skillGap[track];
  const storedText = stored?.version === SKILL_GAP_VERSION && stored.inputHash === inputHash ? stored.text : null;
  const count = (status: SkillStatus["status"]) => skills.filter((s) => s.status === status).length;
  const core = skills.filter((s) => s.level === "core");
  const nice = skills.filter((s) => s.level !== "core");

  return (
    <div className="space-y-6">
      <nav aria-label="Tracks" className="flex flex-wrap gap-2">
        {TRACKS.map((t) => (
          <Link
            key={t}
            href={`/skill-gap?track=${encodeURIComponent(t)}`}
            aria-current={t === track ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              t === track
                ? "border-navy bg-navy text-white"
                : "border-slate-300 bg-surface text-navy hover:border-brand"
            }`}
          >
            {t}
            {t === topTrack && <span className={t === track ? "text-accent-light" : "text-muted"}> · top match</span>}
          </Link>
        ))}
      </nav>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
        <span>
          <strong className="text-navy">{count("have")}</strong> have
        </span>
        <span>
          <strong className="text-navy">{count("weak")}</strong> partly
        </span>
        <span>
          <strong className="text-navy">{count("missing")}</strong> missing
        </span>
        <span className="text-muted">out of {skills.length} skills seniors list for {track}</span>
      </p>

      <Priorities
        key={`${track}:${inputHash}`}
        track={track}
        inputHash={inputHash}
        storedText={storedText}
        hasGaps={count("have") < skills.length}
      />

      <SkillGroup title="Core skills" skills={core} />
      <SkillGroup title="Nice to have" skills={nice} />
      <ScrollToSkill key={track} />

      <Link
        href="/profile"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-navy hover:border-brand"
      >
        <Pencil className="size-4" aria-hidden />
        Edit your skill ratings
      </Link>
    </div>
  );
}

const STATUS = {
  have: { label: "Have", className: "bg-brand text-white" },
  weak: { label: "Partly", className: "bg-accent text-navy" },
  missing: { label: "Missing", className: "border border-slate-400 text-muted" },
} as const;

function SkillGroup({ title, skills }: { title: string; skills: SkillStatus[] }) {
  if (!skills.length) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold text-navy">{title}</h2>
      <ul className="mt-3 space-y-3">
        {skills.map((s) => (
          <SkillRow key={s.skill} skill={s} />
        ))}
      </ul>
    </section>
  );
}

function SkillRow({ skill: s }: { skill: SkillStatus }) {
  const status = STATUS[s.status];
  return (
    <li id={skillAnchor(s.skill)} className="scroll-mt-24 rounded-xl border border-slate-200 bg-surface p-4 shadow-sm data-highlight:border-brand data-highlight:ring-2 data-highlight:ring-brand-tint">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-ink">{s.skill}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {s.area ? (
              <>
                You rated <em>{s.area.label}</em>: {SKILL_LEVELS[s.userLevel].label.toLowerCase()}
              </>
            ) : (
              "Not covered by the profile ratings yet"
            )}
            {s.subArea && <span className="ml-2 rounded bg-brand-tint px-1.5 py-0.5 text-xs text-navy">{s.subArea}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>

      {s.resources.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {s.resources.map((r) => (
            <li key={r.url} className="flex flex-wrap items-baseline gap-x-2">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              >
                {r.title}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <span className="text-xs text-muted">
                from {r.source}
                {r.host === "drive" && " · seniors' drive"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No resource in our documents yet.</p>
      )}
    </li>
  );
}
