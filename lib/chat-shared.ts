// Chat types and constants used by both the /api/chat route and the chat page.

export const TRACKS = ["Software", "Quant/HFT", "Data Science", "Analyst", "Consulting/PM", "ECE Core"] as const;
export type Track = (typeof TRACKS)[number];

export const MAX_QUESTION_CHARS = 500;

// Checked with `scripts/embed.py --search`: each one retrieves on-topic chunks (similarity > 0.85).
export const STARTER_QUESTIONS = [
  "How should I prepare for a VLSI internship interview?",
  "How do I prepare for consulting case interviews?",
  "Which program electives help for embedded systems?",
  "Which open-source programs can I apply to?",
];

export const NOT_COVERED_MESSAGE =
  "I couldn't find this in PathIITR's sources, so I won't guess. Try rephrasing, or pick a different track.";
export const RATE_LIMIT_MESSAGE = "You've asked a lot of questions quickly. Please wait a few minutes.";

// gpt-oss sometimes cites in its own styles: 【2】 or [1†p.5] / [2†L9-L11]. Make them all [n].
export function normalizeCitations(text: string): string {
  return text.replace(/【/g, "[").replace(/】/g, "]").replace(/\[(\d+)†[^\]]*\]/g, "[$1]");
}

// The prompt numbers each passage [k]; several passages can come from one document. Map every [k]
// to its document's number, drop numbers that don't exist and collapse repeats like [2][2].
export function citeDocuments(text: string, sources: Source[]): string {
  const docOf = new Map(sources.flatMap((s) => s.refs.map((k) => [k, s.n] as const)));
  return normalizeCitations(text)
    .replace(/\[(\d+)\]/g, (_, k) => (docOf.has(Number(k)) ? `[${docOf.get(Number(k))}]` : ""))
    .replace(/(\[\d+\])(?:\s*\1)+/g, "$1");
}

// One cited document, numbered in order of its best passage.
export type Source = {
  n: number;
  // Passage numbers [k] in the prompt that came from this document.
  refs: number[];
  title: string;
  kind: string;
  tracks: string[];
  // Where in the document: headings and/or pages, e.g. ["Electives: program elective courses", "p.12"].
  places: string[];
};

// The /api/chat response is NDJSON: one of these per line.
export type ChatEvent =
  | { type: "sources"; sources: Source[]; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string | null; provider: string; cached: boolean }
  | { type: "error"; message: string };
