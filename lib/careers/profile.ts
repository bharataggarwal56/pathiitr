import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { parseInterests } from "@/lib/careers/interests";
import { recommend, type Recommendation } from "@/lib/careers/recommend";
import { parseSkillGap, type SkillGap } from "@/lib/careers/skillgap";
import { checkAreaCoverage, parseSkillLevels, type MatrixRow, type SkillLevels } from "@/lib/careers/skills";

// Reads and writes for the onboarding profile and the stored recommendation. Every call runs as
// the logged-in user, so RLS limits it to their own profile row.

export type Profile = {
  id: string;
  studyYear: number | null;
  branch: string | null;
  interests: string[];
  skillLevels: SkillLevels;
  targetTracks: Track[];
  recommendation: Recommendation | null;
  skillGap: SkillGap;
};

export function parseTracks(value: unknown): Track[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((t): t is Track => TRACKS.includes(t as Track)))];
}

// null when the user hasn't onboarded yet.
export async function loadProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, study_year, branch, interests, skill_levels, target_tracks, recommendation, skill_gap, onboarded_at")
    .maybeSingle();
  if (error) throw error;
  if (!data?.onboarded_at) return null;
  return {
    id: data.id,
    studyYear: data.study_year,
    branch: data.branch,
    interests: parseInterests(data.interests),
    skillLevels: parseSkillLevels(data.skill_levels),
    targetTracks: parseTracks(data.target_tracks),
    recommendation: data.recommendation as Recommendation | null,
    skillGap: parseSkillGap(data.skill_gap),
  };
}

export async function loadMatrix(supabase: SupabaseClient): Promise<MatrixRow[]> {
  const { data, error } = await supabase.from("skill_matrix").select("track, skill, level, sub_area, resources").order("id");
  if (error) throw error;
  const rows = data as MatrixRow[];
  if (process.env.NODE_ENV !== "production") {
    const { unmapped, doubleMapped } = checkAreaCoverage(rows);
    if (unmapped.length || doubleMapped.length) {
      console.error("[careers] lib/careers/skills.ts is out of step with skill_matrix", { unmapped, doubleMapped });
    }
  }
  return rows;
}

// The recommendation for the profile as it is now. Recomputed on every call (rules only, no LLM);
// stored again only when the inputs changed (profile edit, data reload or new rules), and then the
// old explanation is dropped so the explain route writes a new one.
export async function currentRecommendation(
  supabase: SupabaseClient,
  profile: Profile,
  rows: MatrixRow[],
): Promise<Recommendation> {
  const fresh = recommend(profile, rows);
  const stored = profile.recommendation;
  if (stored?.inputHash === fresh.inputHash && stored.version === fresh.version) return { ...fresh, explanation: stored.explanation };

  const { error } = await supabase.from("profiles").update({ recommendation: fresh }).eq("id", profile.id);
  if (error) console.error("[careers] storing recommendation failed", error.message);
  return fresh;
}
