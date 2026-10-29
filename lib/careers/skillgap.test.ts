// Run with `npm test` (node --test, no framework). Uses a tiny made-up matrix, not real data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasFigures, hasLinks } from "./figures.ts";
import { gapInputHash, skillAnchor } from "./skillgap.ts";
import { trackSkillStatus, type MatrixRow } from "./skills.ts";

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
  row("Analyst", "SQL"),
];

test("skillAnchor makes URL-safe ids", () => {
  assert.equal(skillAnchor("Data structures, algorithms and CP"), "data-structures-algorithms-and-cp");
  assert.equal(skillAnchor("Verilog / SystemVerilog"), "verilog-systemverilog");
  assert.equal(skillAnchor("Computer architecture (cache, pipelining)"), "computer-architecture-cache-pipelining");
});

test("the gap hash ignores row order and unrelated areas, and changes with a track rating", () => {
  const hash = (levels: Record<string, 0 | 1 | 2 | 3>, rows = MATRIX) =>
    gapInputHash("Software", trackSkillStatus("Software", rows, levels), 2);
  const base = hash({ dsa: 2, programming: 1 });
  assert.equal(base, hash({ dsa: 2, programming: 1 }, [...MATRIX].reverse()));
  assert.equal(base, hash({ dsa: 2, programming: 1, sql: 3 }));
  assert.notEqual(base, hash({ dsa: 3, programming: 1 }));
  assert.notEqual(base, gapInputHash("Software", trackSkillStatus("Software", MATRIX, { dsa: 2, programming: 1 }), 3));
});

test("LLM text checks: ordinals pass, other figures and links don't", () => {
  assert.equal(hasFigures("Good for a 2nd year student."), false);
  assert.equal(hasFigures("Learn these 5 skills."), true);
  assert.equal(hasLinks("See www.example.com"), true);
  assert.equal(hasLinks("**SQL** comes first."), false);
});
