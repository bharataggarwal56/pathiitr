// Run with `npm test`. Made-up courses only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupElectives, helpsTrack, type Elective } from "./electives.ts";

const course = (code: string, lists: string[], tracks: string[] = [], group: string | null = null): Elective => ({
  code,
  name: `Course ${code}`,
  credits: 3,
  elective_group: group,
  lists,
  tracks_helped: tracks,
  track_reason: null,
});

const ROWS = [
  course("XX-102", ["pec"]),
  course("XX-101", ["pec"], ["Software"]),
  course("XX-201", ["teb", "pec"], ["Software", "Data Science"], "TEB-B"),
  course("XX-202", ["teb"], [], "TEB-A"),
  course("XX-301", ["oec"]),
  course("XX-401", ["minor"]),
];

test("groups come out in order: program, TEB baskets A..H, open", () => {
  const groups = groupElectives(ROWS, null);
  assert.deepEqual(groups.map((g) => g.title), ["Program electives", "TEB-A", "TEB-B", "Open electives"]);
  assert.deepEqual(groups.map((g) => g.section), ["Program electives", "TEB baskets", "TEB baskets", "Open electives"]);
});

test("a course on several lists appears in each group; minor-only courses are left out", () => {
  const groups = groupElectives(ROWS, null);
  const inGroups = (code: string) => groups.filter((g) => g.courses.some((c) => c.code === code)).map((g) => g.id);
  assert.deepEqual(inGroups("XX-201"), ["pec", "teb-b"]);
  assert.deepEqual(inGroups("XX-401"), []);
});

test("courses that help the track come first, then by code", () => {
  const pec = groupElectives(ROWS, "Software")[0].courses.map((c) => c.code);
  assert.deepEqual(pec, ["XX-101", "XX-201", "XX-102"]);
  const all = groupElectives(ROWS, null)[0].courses.map((c) => c.code);
  assert.deepEqual(all, ["XX-101", "XX-102", "XX-201"]);
});

test("helpsTrack is false when no track is selected", () => {
  assert.equal(helpsTrack(ROWS[1], null), false);
  assert.equal(helpsTrack(ROWS[1], "Software"), true);
  assert.equal(helpsTrack(ROWS[1], "Quant/HFT"), false);
});
