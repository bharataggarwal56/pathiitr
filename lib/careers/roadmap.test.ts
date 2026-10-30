// Run with `npm test`. Made-up courses and skills only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoadmap, currentTerm, focusSkills, remainingTerms, suggestForSlots, type RoadmapElective, type Slot } from "./roadmap.ts";
import type { SkillStatus } from "./skills.ts";

const elective = (code: string, lists: string[], tracks: string[], offered: RoadmapElective["offered"] = null): RoadmapElective => ({
  code,
  name: `Course ${code}`,
  credits: 3,
  elective_group: null,
  lists,
  tracks_helped: tracks,
  track_reason: null,
  offered,
});

const slot = (name: string, year: number, semester: Slot["semester"]): Slot => ({ slot: name, name, year, semester, credits: 3 });

const skill = (name: string, level: SkillStatus["level"], status: SkillStatus["status"]): SkillStatus => ({
  skill: name,
  level,
  subArea: null,
  area: null,
  userLevel: status === "have" ? 2 : status === "weak" ? 1 : 0,
  status,
  resources: [],
});

test("Autumn is July-December, Spring January-June", () => {
  assert.deepEqual(currentTerm(3, new Date(2026, 5, 30)), { year: 3, semester: "Spring" });
  assert.deepEqual(currentTerm(3, new Date(2026, 6, 1)), { year: 3, semester: "Autumn" });
  assert.deepEqual(currentTerm(2, new Date(2026, 11, 31)), { year: 2, semester: "Autumn" });
  assert.deepEqual(currentTerm(2, new Date(2026, 0, 1)), { year: 2, semester: "Spring" });
});

test("remaining semesters run from the current one to year 4 Spring", () => {
  assert.equal(remainingTerms({ year: 1, semester: "Autumn" }).length, 8);
  assert.deepEqual(remainingTerms({ year: 3, semester: "Spring" }), [
    { year: 3, semester: "Spring" },
    { year: 4, semester: "Autumn" },
    { year: 4, semester: "Spring" },
  ]);
  assert.deepEqual(remainingTerms({ year: 5, semester: "Autumn" }), []);
});

test("suggestions help the track, match the semester and never repeat", () => {
  const electives = [
    elective("XX-101", ["pec"], ["Software"]),
    elective("XX-102", ["pec"], ["Software"], "Spring"),
    elective("XX-103", ["pec"], ["Quant/HFT"]),
    elective("XX-104", ["pec"], ["Software"], "Autumn"),
    elective("XX-201", ["teb"], ["Software"]),
  ];
  const planned = suggestForSlots([slot("ECL-II", 4, "Autumn"), slot("ECL-I", 3, "Spring"), slot("ECT-I", 3, "Spring")], electives, "Software");
  const bySlot = Object.fromEntries(planned.map((s) => [s.slot, s.suggestions.map((c) => c.code)]));
  assert.deepEqual(planned.map((s) => s.slot), ["ECL-I", "ECT-I", "ECL-II"]);
  assert.deepEqual(bySlot, { "ECL-I": ["XX-101", "XX-102"], "ECT-I": ["XX-201"], "ECL-II": ["XX-104"] });
});

test("slots we have no list for get a note and no suggestions", () => {
  const [oec, dhc] = suggestForSlots([slot("OEC-I", 2, "Autumn"), slot("MSC/DHC-I", 3, "Spring")], [elective("XX-301", ["oec"], ["Software"])], "Software");
  assert.deepEqual(oec.suggestions, []);
  assert.match(oec.note ?? "", /other departments/);
  assert.equal(dhc.optional, true);
});

test("focus skills: missing core first, 2-3 per semester, have skills left out", () => {
  const statuses = [
    skill("nice-weak", "nice_to_have", "weak"),
    skill("core-weak", "core", "weak"),
    skill("core-have", "core", "have"),
    skill("nice-missing", "nice_to_have", "missing"),
    skill("core-missing", "core", "missing"),
  ];
  const plan = focusSkills(statuses, 3).map((s) => s.map((x) => x.skill));
  assert.deepEqual(plan, [["core-missing", "core-weak"], ["nice-missing", "nice-weak"], []]);
  const many = Array.from({ length: 10 }, (_, i) => skill(`s${i}`, "core", "missing"));
  assert.deepEqual(focusSkills(many, 2).map((s) => s.length), [3, 3]);
});

test("buildRoadmap marks the current semester and places courses in their term", () => {
  const plan = buildRoadmap({
    current: { year: 3, semester: "Spring" },
    track: "Software",
    coreCourses: [
      { code: "XX-310", name: "Old", credits: 4, year: 3, semester: "Autumn" },
      { code: "XX-320", name: "Now", credits: 4, year: 3, semester: "Spring" },
    ],
    slots: [slot("ECL-I", 3, "Spring"), slot("ECL-III", 4, "Autumn"), slot("OEC-III", 3, "Autumn")],
    electives: [],
    statuses: [],
  });
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((s) => s.isCurrent), [true, false, false]);
  assert.deepEqual(plan[0].coreCourses.map((c) => c.code), ["XX-320"]);
  assert.deepEqual(plan.map((s) => s.slots.map((x) => x.slot)), [["ECL-I"], ["ECL-III"], []]);
});
