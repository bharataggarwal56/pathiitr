import { createHash } from "node:crypto";
import { TRACKS, type Track } from "../chat-shared.ts";
import { INTERESTS } from "./interests.ts";
import { SKILL_LEVELS, trackSkillStatus, type MatrixRow, type SkillLevels } from "./skills.ts";

// Rule-based career recommender. Score per track, out of 100:
//   skill fit  60  sum of weight x level/3 over the track's matrix skills (core 2, nice-to-have 1),
//                  divided by the most it could be
//   interests  25  12.5 per matching interest, at most 2
//   target     15  the student picked the track as a target
// Ties go to the higher skill fit, then the usual track order. Reasons and gaps are templates
// built from the same numbers; the LLM only rewrites them in a friendlier voice.

// Bump when the rules or the reason wording change, so stored results are recomputed.
export const RECOMMENDER_VERSION = 1;

const SKILL_POINTS = 60;
const INTEREST_POINTS = 12.5;
const MAX_INTERESTS = 2;
const TARGET_POINTS = 15;
const WEIGHT = { core: 2, nice_to_have: 1 } as const;

export type ProfileInput = {
  interests: string[];
  skillLevels: SkillLevels;
  targetTracks: Track[];
};

export type TrackResult = {
  track: Track;
  score: number; // 0-100
  skillFit: number; // 0-100, share of the track's weighted skills covered
  reasons: string[];
  gaps: string[]; // core skills to learn next, matrix names
};

export type Recommendation = {
  version: number;
  inputHash: string;
  top: TrackResult[];
  explanation: string | null;
};

export function scoreTrack(track: Track, profile: ProfileInput, rows: MatrixRow[]): TrackResult {
  const skills = trackSkillStatus(track, rows, profile.skillLevels);
  const maxWeight = skills.reduce((sum, s) => sum + WEIGHT[s.level], 0);
  const gotWeight = skills.reduce((sum, s) => sum + (WEIGHT[s.level] * s.userLevel) / 3, 0);
  const fit = maxWeight ? gotWeight / maxWeight : 0;

  const interests = INTERESTS.filter((i) => profile.interests.includes(i.id) && i.tracks.includes(track));
  const targeted = profile.targetTracks.includes(track);
  const score = Math.round(
    fit * SKILL_POINTS +
      Math.min(interests.length, MAX_INTERESTS) * INTEREST_POINTS +
      (targeted ? TARGET_POINTS : 0),
  );

  // Strengths: the student's best-rated areas among this track's core skills, one entry per area.
  const strengths = new Map<string, number>();
  for (const s of skills) {
    if (s.level === "core" && s.area && s.userLevel >= 2) strengths.set(s.area.label, s.userLevel);
  }
  const topStrengths = [...strengths].sort((a, b) => b[1] - a[1]).slice(0, 2);

  const reasons: string[] = [];
  if (topStrengths.length) {
    const list = topStrengths.map(([label, lvl]) => `${label} (${SKILL_LEVELS[lvl].label.toLowerCase()})`);
    reasons.push(`Core skills for ${track} you're already good at: ${list.join("; ")}.`);
  } else {
    reasons.push(`You haven't rated any of ${track}'s core skills as intermediate or strong yet.`);
  }
  if (interests.length) {
    reasons.push(`It matches your interests: ${interests.map((i) => i.label).join("; ")}.`);
  }
  if (targeted) reasons.push(`You picked ${track} as a target.`);

  // Gaps: core skills rated none first, then beginner.
  const gaps = skills
    .filter((s) => s.level === "core" && s.status !== "have")
    .sort((a, b) => a.userLevel - b.userLevel)
    .slice(0, 2)
    .map((s) => s.skill);

  return { track, score, skillFit: Math.round(fit * 100), reasons, gaps };
}

export function recommend(profile: ProfileInput, rows: MatrixRow[]): Recommendation {
  const ranked = TRACKS.map((t) => scoreTrack(t, profile, rows)).sort(
    (a, b) => b.score - a.score || b.skillFit - a.skillFit || TRACKS.indexOf(a.track) - TRACKS.indexOf(b.track),
  );
  return { version: RECOMMENDER_VERSION, inputHash: hashInput(profile, rows), top: ranked.slice(0, 3), explanation: null };
}

// Same profile and same matrix give the same hash, so a re-saved profile keeps its explanation.
export function hashInput(profile: ProfileInput, rows: MatrixRow[]): string {
  const levels = Object.entries(profile.skillLevels).sort(([a], [b]) => a.localeCompare(b));
  const matrix = rows.map((r) => `${r.track}|${r.level}|${r.skill}`).sort();
  const input = [RECOMMENDER_VERSION, [...profile.interests].sort(), levels, [...profile.targetTracks].sort(), matrix];
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
