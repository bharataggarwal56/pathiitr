import type { Track } from "../chat-shared";

// Interest tags on the onboarding form and the career tracks each one points to.
// Ids are stored in profiles.interests, so never rename one; only add new ids.
export type Interest = { id: string; label: string; tracks: Track[] };

export const INTERESTS: Interest[] = [
  { id: "building_software", label: "Building software and apps", tracks: ["Software"] },
  { id: "algorithms", label: "Algorithms and competitive programming", tracks: ["Software", "Quant/HFT"] },
  { id: "maths_puzzles", label: "Maths and puzzles", tracks: ["Quant/HFT", "Analyst"] },
  { id: "markets_finance", label: "Markets and finance", tracks: ["Quant/HFT", "Analyst"] },
  { id: "data_ml", label: "Data and machine learning", tracks: ["Data Science", "Analyst"] },
  { id: "ai_llms", label: "AI and LLMs", tracks: ["Data Science", "Software"] },
  { id: "business_strategy", label: "Business and strategy", tracks: ["Consulting/PM", "Analyst"] },
  { id: "products_users", label: "Products and users", tracks: ["Consulting/PM"] },
  { id: "circuits", label: "Circuits and analog electronics", tracks: ["ECE Core"] },
  { id: "chip_design", label: "Chip design and VLSI", tracks: ["ECE Core"] },
  { id: "embedded", label: "Embedded systems and IoT", tracks: ["ECE Core"] },
  { id: "signals_comms", label: "Signal processing and communications", tracks: ["ECE Core"] },
];

// Target tracks a student may pick on the form.
export const MAX_TARGETS = 3;

const INTEREST_IDS = new Set(INTERESTS.map((i) => i.id));

export function parseInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && INTEREST_IDS.has(v)))];
}

// Branches on the onboarding form, ECE first. Stored as the short code.
export const BRANCHES = [
  { code: "ECE", label: "Electronics and Communication (ECE)" },
  { code: "EE", label: "Electrical (EE)" },
  { code: "CSE", label: "Computer Science (CSE)" },
  { code: "DSAI", label: "Data Science and AI (DSAI)" },
  { code: "MNC", label: "Mathematics and Computing (MnC)" },
  { code: "EP", label: "Engineering Physics (EP)" },
  { code: "ME", label: "Mechanical (ME)" },
  { code: "PIE", label: "Production and Industrial (PIE)" },
  { code: "CE", label: "Civil (CE)" },
  { code: "CHE", label: "Chemical (CHE)" },
  { code: "MT", label: "Metallurgical and Materials (MT)" },
  { code: "BSBE", label: "Biosciences and Bioengineering (BSBE)" },
  { code: "GT", label: "Geological Technology (GT)" },
  { code: "GPT", label: "Geophysical Technology (GPT)" },
  { code: "ARCH", label: "Architecture (B.Arch)" },
  { code: "MSC", label: "Integrated M.Sc." },
  { code: "OTHER", label: "Other" },
] as const;
