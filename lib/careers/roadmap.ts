import { helpsTrack, type Elective } from "./electives.ts";
import type { SkillStatus } from "./skills.ts";

// Helpers for the roadmap page: a rules-only semester plan from the curriculum and the skill gap.
// Pure code with no I/O, so `node --test` can run it.

export type Season = "Autumn" | "Spring";
export type Term = { year: number; semester: Season };

export type CoreCourse = { code: string; name: string; credits: number; year: number; semester: Season };
export type Slot = { slot: string; name: string; year: number; semester: Season; credits: number };
export type RoadmapElective = Elective & { offered: Season | null };

export type PlannedSlot = Slot & { note: string | null; optional: boolean; suggestions: RoadmapElective[] };
export type Semester = Term & {
  isCurrent: boolean;
  coreCourses: CoreCourse[];
  slots: PlannedSlot[];
  skills: SkillStatus[];
};

const LAST_YEAR = 4; // B.Tech; the curriculum we have stops at year 4
const MAX_SUGGESTIONS = 3;

// Autumn runs July-December, Spring January-June, both inside the same study year.
export function currentTerm(studyYear: number, date: Date): Term {
  return { year: studyYear, semester: date.getMonth() >= 6 ? "Autumn" : "Spring" };
}

// From the current semester up to year 4 Spring; empty for year 5 or later.
export function remainingTerms(current: Term): Term[] {
  const terms: Term[] = [];
  for (let year = current.year; year <= LAST_YEAR; year++) {
    for (const semester of ["Autumn", "Spring"] as const) {
      if (year === current.year && current.semester === "Spring" && semester === "Autumn") continue;
      terms.push({ year, semester });
    }
  }
  return terms;
}

// Which elective list fills a slot, or the fixed line shown when we have nothing to suggest.
export function slotKind(slot: string): { pool: "pec" | "teb" | null; note: string | null; optional: boolean } {
  if (slot.startsWith("ECL-")) return { pool: "pec", note: null, optional: false };
  if (slot.startsWith("ECT-")) return { pool: "teb", note: null, optional: false };
  if (slot.startsWith("OEC-"))
    return { pool: null, note: "Open electives come from other departments; our data only lists ECE's.", optional: false };
  if (slot.startsWith("HSSEC-")) return { pool: null, note: "Any HSS elective; HSS courses aren't in our data.", optional: false };
  if (slot.startsWith("MSC/DHC-"))
    return { pool: null, note: "Only if you're doing a minor or departmental honours.", optional: true };
  if (slot.startsWith("ECP-")) return { pool: null, note: "BTP / project / internship slot.", optional: false };
  return { pool: null, note: null, optional: false };
}

const termIndex = (t: Term) => t.year * 2 + (t.semester === "Spring" ? 1 : 0);
const sameTerm = (a: Term, b: Term) => a.year === b.year && a.semester === b.semester;

// Up to 3 courses per slot that help the track and run in that semester (or have no fixed semester).
// Slots are filled in semester order and a course is suggested only once in the whole plan.
export function suggestForSlots(slots: Slot[], electives: RoadmapElective[], track: string): PlannedSlot[] {
  const used = new Set<string>();
  const candidates = electives.filter((c) => helpsTrack(c, track)).sort((a, b) => a.code.localeCompare(b.code));
  return [...slots]
    .sort((a, b) => termIndex(a) - termIndex(b) || a.slot.localeCompare(b.slot))
    .map((s) => {
      const { pool, note, optional } = slotKind(s.slot);
      const suggestions = pool
        ? candidates
            .filter((c) => c.lists.includes(pool) && !used.has(c.code) && (c.offered === null || c.offered === s.semester))
            .slice(0, MAX_SUGGESTIONS)
        : [];
      suggestions.forEach((c) => used.add(c.code));
      return { ...s, note, optional, suggestions };
    });
}

const GAP_ORDER = (s: SkillStatus) => (s.level === "core" ? 0 : 2) + (s.status === "missing" ? 0 : 1);

// The non-"have" skills, missing core first, split 2-3 per semester in that order.
// Later semesters can end up with none.
export function focusSkills(statuses: SkillStatus[], semesters: number): SkillStatus[][] {
  const gap = statuses.filter((s) => s.status !== "have").sort((a, b) => GAP_ORDER(a) - GAP_ORDER(b));
  const perSemester = Math.min(3, Math.max(2, Math.ceil(gap.length / Math.max(semesters, 1))));
  return Array.from({ length: semesters }, (_, i) => gap.slice(i * perSemester, (i + 1) * perSemester));
}

export function buildRoadmap(input: {
  current: Term;
  track: string;
  coreCourses: CoreCourse[];
  slots: Slot[];
  electives: RoadmapElective[];
  statuses: SkillStatus[];
}): Semester[] {
  const terms = remainingTerms(input.current);
  const termSlots = input.slots.filter((s) => terms.some((t) => sameTerm(t, s)));
  const planned = suggestForSlots(termSlots, input.electives, input.track);
  const skills = focusSkills(input.statuses, terms.length);
  return terms.map((t, i) => ({
    ...t,
    isCurrent: i === 0,
    coreCourses: input.coreCourses.filter((c) => sameTerm(c, t)).sort((a, b) => a.code.localeCompare(b.code)),
    slots: planned.filter((s) => sameTerm(s, t)),
    skills: skills[i],
  }));
}
