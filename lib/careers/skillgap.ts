import { createHash } from "node:crypto";
import type { SkillStatus } from "./skills.ts";

// Helpers for the skill-gap page. Pure code with no I/O, so `node --test` can run it.

// Bump when the priorities prompt changes, so stored texts are written again.
export const SKILL_GAP_VERSION = 1;

// One stored "what to learn first" text per track, in profiles.skill_gap.
export type GapEntry = { version: number; inputHash: string; text: string };
export type SkillGap = Record<string, GapEntry>;

export function parseSkillGap(value: unknown): SkillGap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SkillGap;
}

// URL-safe id for a skill row, used as the #anchor in links from /careers.
export function skillAnchor(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Only this track's skills and ratings count, so editing an unrelated area keeps the stored text.
export function gapInputHash(track: string, statuses: SkillStatus[], studyYear: number | null): string {
  const skills = statuses.map((s) => `${s.skill}|${s.level}|${s.userLevel}`).sort();
  const input = [SKILL_GAP_VERSION, track, studyYear, skills];
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
