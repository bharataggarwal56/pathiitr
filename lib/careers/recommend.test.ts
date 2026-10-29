// Run with `npm test` (node --test, no framework). Uses a tiny made-up matrix, not real data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { recommend, scoreTrack } from "./recommend.ts";
import { checkAreaCoverage, parseSkillLevels, trackSkillStatus, type MatrixRow } from "./skills.ts";

const row = (track: string, skill: string, level: "core" | "nice_to_have" = "core"): MatrixRow => ({
  track,
  skill,
  level,
  sub_area: null,
  resources: [],
});

const MATRIX: MatrixRow[] = [
  row("Software", "Data structures and algorithms"),
  row("Software", "Object-oriented programming"),
  row("Software", "System design basics", "nice_to_have"),
  row("Quant/HFT", "Probability and statistics"),
  row("Quant/HFT", "Puzzles and brain teasers"),
  row("Data Science", "Probability and statistics"),
  row("Data Science", "SQL"),
  row("Analyst", "SQL"),
  row("Analyst", "Excel / spreadsheets"),
  row("Consulting/PM", "Guesstimates / market sizing"),
  row("ECE Core", "Verilog / SystemVerilog"),
  row("ECE Core", "Op-amps and negative feedback"),
];

test("every skill belongs to one area", () => {
  assert.deepEqual(checkAreaCoverage(MATRIX), { unmapped: [], doubleMapped: [] });
  assert.deepEqual(checkAreaCoverage([row("Software", "Underwater basket weaving")]).unmapped, [
    "Underwater basket weaving",
  ]);
});

test("parseSkillLevels drops unknown areas and bad levels", () => {
  assert.deepEqual(parseSkillLevels({ dsa: 3, sql: "2", nope: 1, math: 4, ml: 1.5, python: -1 }), { dsa: 3, sql: 2 });
  assert.deepEqual(parseSkillLevels([1, 2]), {});
});

test("trackSkillStatus puts core first and maps levels to status", () => {
  const rows = trackSkillStatus("Software", MATRIX, { dsa: 3, programming: 1 });
  assert.deepEqual(
    rows.map((r) => [r.skill, r.status]),
    [
      ["Data structures and algorithms", "have"],
      ["Object-oriented programming", "weak"],
      ["System design basics", "missing"],
    ],
  );
});

test("a strong coder gets Software first, with reasons and gaps", () => {
  const rec = recommend(
    { interests: ["building_software"], skillLevels: { dsa: 3, programming: 2 }, targetTracks: ["Software"] },
    MATRIX,
  );
  assert.equal(rec.top.length, 3);
  assert.equal(rec.top[0].track, "Software");
  assert.match(rec.top[0].reasons[0], /^Core skills for Software .*Data structures/);
  assert.ok(rec.top[0].reasons.some((r) => r.includes("target")));
});

test("a VLSI-leaning student gets ECE Core first", () => {
  const rec = recommend({ interests: ["chip_design", "circuits"], skillLevels: { digital_vlsi: 3 }, targetTracks: [] }, MATRIX);
  assert.equal(rec.top[0].track, "ECE Core");
  assert.deepEqual(rec.top[0].gaps, ["Op-amps and negative feedback"]);
});

test("score adds up: full fit + 2 interests + target = 100", () => {
  const r = scoreTrack(
    "ECE Core",
    { interests: ["chip_design", "circuits", "embedded"], skillLevels: { digital_vlsi: 3, analog: 3 }, targetTracks: ["ECE Core"] },
    MATRIX,
  );
  assert.equal(r.score, 100);
  assert.equal(r.skillFit, 100);
  assert.deepEqual(r.gaps, []);
});

test("the input hash ignores order and changes with levels", () => {
  const a = recommend({ interests: ["data_ml", "ai_llms"], skillLevels: { sql: 2, ml: 1 }, targetTracks: [] }, MATRIX);
  const b = recommend({ interests: ["ai_llms", "data_ml"], skillLevels: { ml: 1, sql: 2 }, targetTracks: [] }, MATRIX);
  const c = recommend({ interests: ["data_ml", "ai_llms"], skillLevels: { sql: 3, ml: 1 }, targetTracks: [] }, MATRIX);
  assert.equal(a.inputHash, b.inputHash);
  assert.notEqual(a.inputHash, c.inputHash);
});
