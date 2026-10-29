import "server-only";
import { LLMBusyError, generate } from "@/lib/llm";
import { NOT_COVERED_MESSAGE, type Source, type Track } from "@/lib/chat-shared";

// Server-side pieces of the chat: retrieval settings, the Hinglish rewrite and the answer prompt.

export const PROMPT_VERSION = "chat-v2";
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

// Group chunks by document in score order: one number per document.
export function numberSources(chunks: MatchedChunk[]) {
  const byDoc = new Map<string, { source: Source; chunks: MatchedChunk[] }>();
  for (const chunk of chunks) {
    let entry = byDoc.get(chunk.document_id);
    if (!entry) {
      entry = {
        source: { n: byDoc.size + 1, title: chunk.display_title, kind: chunk.kind, tracks: chunk.tracks, places: [] },
        chunks: [],
      };
      byDoc.set(chunk.document_id, entry);
    }
    entry.chunks.push(chunk);
    const place = [chunk.heading, chunk.page_start ? `p.${chunk.page_start}` : null].filter(Boolean).join(", ");
    if (place && !entry.source.places.includes(place)) entry.source.places.push(place);
  }
  return [...byDoc.values()];
}

export const SYSTEM_PROMPT = `You are PathIITR, a career and academics guide for IIT Roorkee students (ECE in depth).
Answer ONLY from the numbered sources in the message: seniors' notes, internship experiences and the official curriculum.
Rules:
- Put the source number in plain ASCII square brackets after every point, like [1] or [2][3], with no page or line markers inside. Use only numbers that exist.
- Never invent or guess companies, stipends, CTCs, cutoffs, CGPA criteria, people, dates or links. Mention them only if a source states them.
- If the sources don't answer the question, reply with exactly this and nothing else: ${NOT_COVERED_MESSAGE}
- If they answer only part of it, answer that part and say plainly what isn't covered.
- Always reply in clear English, even if the question is in Hindi or Hinglish.
- Be concise: one short opening line, then at most 6 bullet points. Use **bold** sparingly. No headings or tables.
- Don't talk about "the sources" or "the context"; just answer and cite.`;

export function buildPrompt(
  question: string,
  searchQuery: string,
  groups: ReturnType<typeof numberSources>,
): string {
  const blocks = groups.map(({ source, chunks }) => {
    const parts = chunks.map((c) => {
      const place = [c.heading, c.page_start ? `p.${c.page_start}` : null].filter(Boolean).join(", ");
      return (place ? `(${place})\n` : "") + c.content.trim();
    });
    return `[${source.n}] ${source.title} (${source.tracks.join(", ")})\n${parts.join("\n…\n")}`;
  });
  const query = searchQuery !== question ? `\n(In English: ${searchQuery})` : "";
  return `Sources:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question}${query}`;
}
