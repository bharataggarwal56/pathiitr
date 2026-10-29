import "server-only";
import { LLMBusyError, generate } from "@/lib/llm";
import { NOT_COVERED_MESSAGE, normalizeCitations, type Source, type Track } from "@/lib/chat-shared";

// Server-side pieces of the chat: retrieval settings, the Hinglish rewrite and the answer prompt.

export const PROMPT_VERSION = "chat-v9";
export const MATCH_COUNT = 5;
// Below this, the best chunk isn't about the question: answer "not covered" without the LLM.
// From embed.py --search: on-topic questions score 0.83-0.91, off-topic ones 0.74-0.79.
export const MIN_SIMILARITY = 0.8;

// A picked track also searches the cross-track docs (internship tips, programs) and the curriculum.
export function filterTracks(track: Track | null): string[] | null {
  return track ? [track, "Cross-track", "curriculum"] : null;
}

export type MatchedChunk = {
  id: string;
  document_id: string;
  display_title: string;
  kind: string;
  heading: string | null;
  page_start: number | null;
  tracks: string[];
  content: string;
  similarity: number;
  score: number;
};

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH_WORDS =
  /\b(kaise|kya|ke liye|karna|karne|karun|hai|hain|kaun|kitna|kitne|chahiye|mujhe|nahi|nahin|kyun|batao)\b/i;

export function looksNonEnglish(question: string): boolean {
  return DEVANAGARI.test(question) || HINGLISH_WORDS.test(question);
}

// Hindi/Hinglish -> short English search query, so retrieval works on our English chunks.
// Not cached (the cache is for answers). Falls back to the original if the LLM is busy.
export async function englishQuery(question: string): Promise<string> {
  try {
    const { text } = await generate({
      system:
        "Rewrite the student's question, which may be in Hindi or Hinglish, as one short English search " +
        "query about careers, internships, placements or courses. Output only the query.",
      prompt: question,
      maxTokens: 300,
    });
    const query = text.trim().replace(/^["']|["']$/g, "");
    return query && query.length <= 300 ? query : question;
  } catch (error) {
    if (error instanceof LLMBusyError) return question;
    throw error;
  }
}

function place(chunk: MatchedChunk) {
  return [chunk.heading, chunk.page_start ? `p.${chunk.page_start}` : null].filter(Boolean).join(", ");
}

// Each chunk is passage [k] (score order) in the prompt; sources group them by document.
export function numberSources(chunks: MatchedChunk[]): Source[] {
  const byDoc = new Map<string, Source>();
  chunks.forEach((chunk, i) => {
    let source = byDoc.get(chunk.document_id);
    if (!source) {
      source = { n: byDoc.size + 1, refs: [], title: chunk.display_title, kind: chunk.kind, tracks: chunk.tracks, places: [] };
      byDoc.set(chunk.document_id, source);
    }
    source.refs.push(i + 1);
    if (place(chunk) && !source.places.includes(place(chunk))) source.places.push(place(chunk));
  });
  return [...byDoc.values()];
}

export const SYSTEM_PROMPT = `You are PathIITR, a career and academics guide for IIT Roorkee students (ECE in depth).
Answer ONLY from the numbered sources in the message: seniors' notes, internship experiences and the official curriculum.
Rules:
- Every bullet point ends with its own citation in plain ASCII square brackets, like [1] or [2][3], with no page or line markers inside. Never put citations only at the end of the answer, and never let one citation cover several bullets. Use only numbers that exist.
- Never invent or guess companies, stipends, CTCs, cutoffs, CGPA criteria, people, dates or links. Mention them only if a source states them.
- Every claim must come from a single passage. Never combine a company from one passage with a number, criterion or fact from another. Any number (CGPA, stipend, number of rounds, dates) must stay with the same company or role it has in its passage, and cite that passage.
- If the sources don't answer the question, reply with exactly this and nothing else: ${NOT_COVERED_MESSAGE}
- If they answer only part of it, answer that part and say plainly what isn't covered, in your own words, e.g. "No CGPA cut-off is listed for Texas Instruments."
- Always reply in clear English, even if the question is in Hindi or Hinglish.
- Be concise: one short opening line, then at most 6 bullet points. Use **bold** sparingly. No headings or tables.
- Write as a guide who knows this, not as someone reading documents. Never start with or use phrases like "The provided sources", "The sources", "According to the sources", "the context", "the passages" or "the documents". Just answer and cite.`;

export function buildPrompt(question: string, searchQuery: string, chunks: MatchedChunk[]): string {
  const blocks = chunks.map((c, i) => {
    const where = place(c) ? ` - ${place(c)}` : "";
    return `[${i + 1}] ${c.display_title} (${c.tracks.join(", ")})${where}\n${c.content.trim()}`;
  });
  const query = searchQuery !== question ? `\n(In English: ${searchQuery})` : "";
  // Repeated right before the question: smaller fallback models follow the last instruction best.
  return `Sources:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question}${query}\n\n${FORMAT_REMINDER}`;
}

const FORMAT_REMINDER =
  'Format: every bullet ends with its own source number, e.g. "- Practise mock interviews with a friend [2]". ' +
  "Do not mention the sources or the context in the text.";

export const FIGURES_NOTE =
  "\n\n_Some figures above couldn't be matched to the sources. Please check the cited documents._";

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ""));
}

// Numbers in the answer that don't appear in any passage cited on the same line ([k] = chunks[k-1]).
// A line with numbers but no citation counts as unmatched. No LLM call: a plain text check.
export function unmatchedFigures(answer: string, chunks: MatchedChunk[]): string[] {
  const unmatched: string[] = [];
  for (const raw of normalizeCitations(answer).split("\n")) {
    const cited = [...raw.matchAll(/\[(\d+)\]/g)].map((m) => chunks[Number(m[1]) - 1]).filter(Boolean);
    // Drop the citation markers and any "1." list numbering before looking for figures.
    const line = raw.replace(/\[\d+\]/g, "").replace(/^\s*\d+\.\s/, "");
    const figures = numbersIn(line);
    if (figures.length === 0) continue;
    const known = new Set(cited.flatMap((c) => numbersIn(c.content)));
    unmatched.push(...figures.filter((n) => !known.has(n)));
  }
  return unmatched;
}
