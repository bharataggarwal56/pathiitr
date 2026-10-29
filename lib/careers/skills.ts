// Skill areas: what the onboarding form asks students to rate, and how each rating maps onto the
// skill matrix. Shared by the career recommender and the skill-gap page.
//
// Area ids are stored in profiles.skill_levels, so never rename one; only add new ids.
// Every matrix skill must belong to exactly one area (checkAreaCoverage reports gaps in dev).
// Pure code with no I/O, so `node --test` can run it.

export const SKILL_LEVELS = [
  { value: 0, label: "None" },
  { value: 1, label: "Beginner" },
  { value: 2, label: "Intermediate" },
  { value: 3, label: "Strong" },
] as const;
export type SkillLevel = 0 | 1 | 2 | 3;
export type SkillLevels = Record<string, SkillLevel>;

export const SKILL_GROUPS = ["Coding", "Maths and data", "Business and product", "Electronics"] as const;

export type SkillArea = {
  id: string;
  label: string;
  group: (typeof SKILL_GROUPS)[number];
  skills: string[]; // exact skill names in skill_matrix
};

export const SKILL_AREAS: SkillArea[] = [
  {
    id: "dsa",
    label: "Data structures, algorithms and CP",
    group: "Coding",
    skills: [
      "Data structures and algorithms",
      "Data structures and algorithms basics",
      "Data structures, algorithms and CP",
      "Competitive programming / timed problem solving (online tests)",
      "Dynamic programming",
      "Graphs and trees",
      "Advanced data structures (segment tree, Fenwick tree, trie)",
      "Number theory for CP (modular arithmetic, sieve, GCD)",
    ],
  },
  {
    id: "programming",
    label: "Programming and OOP",
    group: "Coding",
    skills: [
      "Object-oriented programming",
      "One language in depth (C++ with STL, or Java/Python)",
      "Programming basics (C/C++, OOP, data structures)",
    ],
  },
  {
    id: "cpp_internals",
    label: "C++ internals (STL, memory, virtual tables)",
    group: "Coding",
    skills: ["C++ internals (STL implementation, memory, virtual tables)"],
  },
  {
    id: "cs_systems",
    label: "OS, DBMS, networks, Linux and system design",
    group: "Coding",
    skills: ["Operating systems", "DBMS and computer networks", "System design basics", "Linux/Unix"],
  },
  {
    id: "dev_projects",
    label: "Projects: web, cloud and deployment",
    group: "Coding",
    skills: ["Projects: web frameworks, cloud, GitHub", "Model deployment, cloud and dashboards"],
  },
  {
    id: "python",
    label: "Python",
    group: "Coding",
    skills: ["Python", "Python for data analysis"],
  },
  {
    id: "prob_stats",
    label: "Probability and statistics",
    group: "Maths and data",
    skills: ["Probability and statistics"],
  },
  {
    id: "math",
    label: "Linear algebra and mental maths",
    group: "Maths and data",
    skills: ["Linear algebra", "Mental maths and quick calculation"],
  },
  {
    id: "puzzles",
    label: "Puzzles and brain teasers",
    group: "Maths and data",
    skills: ["Puzzles and brain teasers", "Puzzles"],
  },
  {
    id: "aptitude",
    label: "Aptitude (quant, LR/DI, verbal)",
    group: "Maths and data",
    skills: ["Aptitude (quant, LR/DI, verbal) for written tests", "Aptitude for written tests"],
  },
  {
    id: "ml",
    label: "Machine learning",
    group: "Maths and data",
    skills: [
      "Machine learning fundamentals (supervised/unsupervised, bias-variance, cross-validation)",
      "Model evaluation and imbalanced data",
      "Python and ML libraries (scikit-learn, PyTorch/TensorFlow)",
      "Machine learning and data analysis",
      "Basic machine learning and probability",
      "Dimensionality reduction (PCA, SVD)",
      "Tree-based models",
    ],
  },
  {
    id: "deep_learning",
    label: "Deep learning and LLM tools",
    group: "Maths and data",
    skills: ["Deep learning and transformers (attention, RAG)", "Using AI tools and LLM APIs"],
  },
  {
    id: "sql",
    label: "SQL",
    group: "Maths and data",
    skills: ["SQL"],
  },
  {
    id: "excel",
    label: "Excel, dashboards and slides",
    group: "Business and product",
    skills: ["Excel / spreadsheets", "Dashboards and KPI tracking", "Excel models and PowerPoint decks"],
  },
  {
    id: "cases",
    label: "Case interviews and guesstimates",
    group: "Business and product",
    skills: [
      "Case interviews (profitability, market entry, frameworks)",
      "Guesstimates / market sizing",
      "Guesstimates and case studies",
      "Business basics (market segmentation, business analysis)",
    ],
  },
  {
    id: "product",
    label: "Product management (product sense, metrics, PRDs)",
    group: "Business and product",
    skills: [
      "Product sense and PM case studies",
      "Product metrics and analytics (funnels, A/B tests)",
      "PRDs, roadmaps and prioritisation",
      "PM interview question practice",
      "Wireframing and prototyping",
      "User research and customer feedback (interviews, surveys, personas)",
    ],
  },
  {
    id: "analog",
    label: "Analog circuits, networks and devices",
    group: "Electronics",
    skills: [
      "Network theory, poles/zeros, frequency response",
      "Op-amps and negative feedback",
      "Analog circuits (single-stage, differential amplifiers, current mirrors, Miller effect)",
      "EDA tools (Cadence, SPICE)",
      "Semiconductor device basics",
    ],
  },
  {
    id: "digital_vlsi",
    label: "Digital design, Verilog and VLSI",
    group: "Electronics",
    skills: [
      "Digital logic and FSMs (Moore/Mealy)",
      "Verilog / SystemVerilog",
      "CMOS and static timing analysis",
      "SRAM and DRAM basics",
    ],
  },
  {
    id: "comp_arch",
    label: "Computer architecture",
    group: "Electronics",
    skills: ["Computer architecture (cache, pipelining, memory hierarchy)"],
  },
  {
    id: "embedded",
    label: "Embedded C, microcontrollers and RTOS",
    group: "Electronics",
    skills: ["Embedded C, microcontrollers and RTOS"],
  },
  {
    id: "signals",
    label: "Signal processing and comms",
    group: "Electronics",
    skills: ["Basic signal processing"],
  },
  {
    id: "ece_interview",
    label: "ECE core interview practice",
    group: "Electronics",
    skills: ["Company-specific practice (TI interview questions)"],
  },
];

const AREA_IDS = new Set(SKILL_AREAS.map((a) => a.id));
const AREA_BY_SKILL = new Map(SKILL_AREAS.flatMap((a) => a.skills.map((s) => [s, a] as const)));

export type Resource = { title: string; url: string; source: string; host: string };

// One skill_matrix row as the app reads it.
export type MatrixRow = {
  track: string;
  skill: string;
  level: "core" | "nice_to_have";
  sub_area: string | null;
  resources: Resource[];
};

export type SkillStatus = {
  skill: string;
  level: "core" | "nice_to_have";
  subArea: string | null;
  area: SkillArea | null;
  userLevel: SkillLevel;
  status: "have" | "weak" | "missing"; // intermediate or strong / beginner / none
  resources: Resource[];
};

export function areaForSkill(skill: string): SkillArea | null {
  return AREA_BY_SKILL.get(skill) ?? null;
}

export function levelForSkill(skill: string, levels: SkillLevels): SkillLevel {
  const area = areaForSkill(skill);
  return area ? (levels[area.id] ?? 0) : 0;
}

// Every matrix skill of one track with the student's level, core skills first.
export function trackSkillStatus(track: string, rows: MatrixRow[], levels: SkillLevels): SkillStatus[] {
  return rows
    .filter((r) => r.track === track)
    .sort((a, b) => Number(a.level !== "core") - Number(b.level !== "core"))
    .map((r) => {
      const userLevel = levelForSkill(r.skill, levels);
      return {
        skill: r.skill,
        level: r.level,
        subArea: r.sub_area,
        area: areaForSkill(r.skill),
        userLevel,
        status: userLevel >= 2 ? "have" : userLevel === 1 ? "weak" : "missing",
        resources: r.resources ?? [],
      };
    });
}

// Matrix skills no area covers, and skill names listed under more than one area.
export function checkAreaCoverage(rows: MatrixRow[]): { unmapped: string[]; doubleMapped: string[] } {
  const unmapped = [...new Set(rows.map((r) => r.skill).filter((s) => !AREA_BY_SKILL.has(s)))];
  const all = SKILL_AREAS.flatMap((a) => a.skills);
  const doubleMapped = [...new Set(all.filter((s, i) => all.indexOf(s) !== i))];
  return { unmapped, doubleMapped };
}

// Keeps only known area ids with whole-number levels 0-3; anything else is dropped.
// Used on form input and on what comes back from the database.
export function parseSkillLevels(value: unknown): SkillLevels {
  const levels: SkillLevels = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return levels;
  for (const [id, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (AREA_IDS.has(id) && Number.isInteger(n) && n >= 0 && n <= 3) levels[id] = n as SkillLevel;
  }
  return levels;
}
