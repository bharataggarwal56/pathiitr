"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveProfile, type OnboardingState } from "@/app/onboarding/actions";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { BRANCHES, INTERESTS, MAX_TARGETS } from "@/lib/careers/interests";
import { SKILL_AREAS, SKILL_GROUPS, SKILL_LEVELS, type SkillLevels } from "@/lib/careers/skills";

export type OnboardingInitial = {
  studyYear: number | null;
  branch: string | null;
  interests: string[];
  skillLevels: SkillLevels;
  targetTracks: Track[];
};

const CHIP =
  "cursor-pointer rounded-full border border-slate-300 bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-brand has-checked:border-brand has-checked:bg-brand has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand has-disabled:cursor-not-allowed has-disabled:opacity-50";
const SELECT =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-brand";

export default function OnboardingForm({ initial }: { initial: OnboardingInitial | null }) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(saveProfile, { error: null });
  const [targets, setTargets] = useState<Track[]>(initial?.targetTracks ?? []);

  const toggleTarget = (track: Track) =>
    setTargets((all) => (all.includes(track) ? all.filter((t) => t !== track) : [...all, track]));

  return (
    <form action={formAction} className="space-y-6">
      <Section step={1} title="About you">
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">Year</span>
            <select name="year" required defaultValue={initial?.studyYear ?? ""} className={SELECT}>
              <option value="" disabled>
                Choose
              </option>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy">Branch</span>
            <select name="branch" required defaultValue={initial?.branch ?? ""} className={SELECT}>
              <option value="" disabled>
                Choose
              </option>
              {BRANCHES.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section step={2} title="What interests you?" hint="Pick at least one.">
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <label key={i.id} className={CHIP}>
              <input
                type="checkbox"
                name="interests"
                value={i.id}
                defaultChecked={initial?.interests.includes(i.id)}
                className="sr-only"
              />
              {i.label}
            </label>
          ))}
        </div>
      </Section>

      <Section step={3} title="Rate your skills" hint="Be honest; leave anything you haven't studied at None.">
        <div className="space-y-6">
          {SKILL_GROUPS.map((group) => (
            <fieldset key={group}>
              <legend className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{group}</legend>
              <div className="divide-y divide-slate-100">
                {SKILL_AREAS.filter((a) => a.group === group).map((area) => (
                  <SkillRow key={area.id} id={area.id} label={area.label} value={initial?.skillLevels[area.id] ?? 0} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Section>

      <Section step={4} title="Tracks you're aiming for" hint={`Optional. Up to ${MAX_TARGETS}; they get a small boost.`}>
        <div className="flex flex-wrap gap-2">
          {TRACKS.map((track) => (
            <label key={track} className={CHIP}>
              <input
                type="checkbox"
                name="targets"
                value={track}
                checked={targets.includes(track)}
                disabled={!targets.includes(track) && targets.length >= MAX_TARGETS}
                onChange={() => toggleTarget(track)}
                className="sr-only"
              />
              {track}
            </label>
          ))}
        </div>
      </Section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Saved to your account only. Nobody else can see it.</p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-navy shadow-sm transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Saving..." : "See my career matches"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border-l-4 border-accent bg-surface p-3 text-ink shadow-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-semibold text-navy">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy text-sm text-white">{step}</span>
        {title}
      </h2>
      {hint && <p className="mt-1 ml-10 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// One skill area with a None / Beginner / Intermediate / Strong segmented control (radio buttons).
function SkillRow({ id, label, value }: { id: string; label: string; value: number }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-ink">{label}</span>
      <div className="grid shrink-0 grid-cols-4 overflow-hidden rounded-lg border border-slate-300 sm:w-96">
        {SKILL_LEVELS.map((lvl) => (
          <label
            key={lvl.value}
            className="cursor-pointer border-l border-slate-300 px-1 py-1.5 text-center text-xs text-muted transition-colors first:border-l-0 hover:bg-brand-tint has-checked:bg-brand has-checked:font-medium has-checked:text-white has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-navy sm:text-sm"
          >
            <input type="radio" name={`skill_${id}`} value={lvl.value} defaultChecked={value === lvl.value} className="sr-only" />
            {lvl.label}
          </label>
        ))}
      </div>
    </div>
  );
}
