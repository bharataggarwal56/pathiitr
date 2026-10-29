"use server";

import { redirect } from "next/navigation";
import { isAllowedSession } from "@/lib/auth";
import { TRACKS } from "@/lib/chat-shared";
import { BRANCHES, MAX_TARGETS, parseInterests } from "@/lib/careers/interests";
import { currentRecommendation, loadMatrix, loadProfile, parseTracks } from "@/lib/careers/profile";
import { SKILL_AREAS, parseSkillLevels } from "@/lib/careers/skills";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error: string | null };

// Saves the onboarding form to the user's own profile (RLS), stores the rule-based
// recommendation, then opens /careers. Every field is checked against the fixed lists.
export async function saveProfile(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) return { error: "Please log in with your IITR account." };

  const year = Number(form.get("year"));
  const branch = String(form.get("branch") ?? "");
  const interests = parseInterests(form.getAll("interests"));
  const targets = parseTracks(form.getAll("targets"));
  const skillLevels = parseSkillLevels(Object.fromEntries(SKILL_AREAS.map((a) => [a.id, form.get(`skill_${a.id}`) ?? 0])));

  if (!Number.isInteger(year) || year < 1 || year > 5) return { error: "Pick your year." };
  if (!BRANCHES.some((b) => b.code === branch)) return { error: "Pick your branch." };
  if (!interests.length) return { error: "Pick at least one interest." };
  if (targets.length > MAX_TARGETS) return { error: `Pick at most ${MAX_TARGETS} target tracks.` };

  try {
    const existing = await loadProfile(supabase);
    const { error } = await supabase.from("profiles").upsert({
      id: auth.claims.sub,
      study_year: year,
      branch,
      interests,
      skill_levels: skillLevels,
      target_tracks: targets.sort((a, b) => TRACKS.indexOf(a) - TRACKS.indexOf(b)),
      ...(existing ? {} : { onboarded_at: new Date().toISOString() }),
    });
    if (error) throw error;

    const profile = await loadProfile(supabase);
    if (profile) await currentRecommendation(supabase, profile, await loadMatrix(supabase));
  } catch (error) {
    console.error("[onboarding] save failed", (error as { message?: string })?.message ?? error);
    return { error: "Couldn't save your profile. Please try again." };
  }
  redirect("/careers");
}
