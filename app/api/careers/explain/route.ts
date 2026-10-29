import { NextResponse, type NextRequest } from "next/server";
import { isAllowedSession } from "@/lib/auth";
import { hasFigures } from "@/lib/careers/figures";
import { loadProfile } from "@/lib/careers/profile";
import type { Recommendation } from "@/lib/careers/recommend";
import { BUSY_MESSAGE, LLMBusyError, generate } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const YEAR_WORDS = ["", "first", "second", "third", "fourth", "fifth"];

const SYSTEM_PROMPT = `You are PathIITR, a friendly career guide for IIT Roorkee students.
You get the notes behind a student's top career-track matches. Rewrite them as a short, warm explanation.
Rules:
- Use only the facts in the notes. Do not add companies, numbers, scores, salaries, stipends, cut-offs, links or people.
- Write one paragraph of 2-3 sentences per track, in the order given, starting with the track name in bold, e.g. **Software**.
- Speak to the student as "you". Plain English, no headings, no lists.
- Be encouraging but honest: if a match rests mostly on interests, say the skills can be built, and mention what to learn next.`;

// Each line is a note from the rule-based recommender; scores are left out so the text has no numbers.
function buildPrompt(rec: Recommendation, studyYear: number | null): string {
  const year = studyYear ? `The student is in their ${YEAR_WORDS[studyYear]} year.\n\n` : "";
  const tracks = rec.top
    .map((t, i) => {
      const gaps = t.gaps.length ? `\n- Next to learn: ${t.gaps.join("; ")}` : "";
      return `Match ${i + 1}: ${t.track}\n${t.reasons.map((r) => `- ${r}`).join("\n")}${gaps}`;
    })
    .join("\n\n");
  return `${year}${tracks}`;
}

// POST {inputHash} -> {explanation}. Writes the friendly explanation for the user's current
// recommendation once and stores it in profiles.recommendation; later calls return the stored text
// without an LLM call. An empty string means the text failed the figures check (not retried).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) {
    return NextResponse.json({ error: "Please log in with your IITR account." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const inputHash = typeof body?.inputHash === "string" ? body.inputHash : "";

  try {
    const profile = await loadProfile(supabase);
    const rec = profile?.recommendation;
    if (!profile || !rec || rec.inputHash !== inputHash) {
      return NextResponse.json({ error: "Your profile has changed. Please reload the page." }, { status: 409 });
    }
    if (rec.explanation !== null) return NextResponse.json({ explanation: rec.explanation });

    const result = await generate({ system: SYSTEM_PROMPT, prompt: buildPrompt(rec, profile.studyYear), maxTokens: 700 });
    let explanation = result.text.trim();
    if (hasFigures(explanation)) {
      console.warn("[careers] explanation dropped: it contains figures");
      explanation = "";
    }

    // Only if the profile hasn't changed meanwhile; otherwise this text belongs to old inputs.
    const { error } = await supabase
      .from("profiles")
      .update({ recommendation: { ...rec, explanation } })
      .eq("id", profile.id)
      .eq("recommendation->>inputHash", inputHash);
    if (error) console.error("[careers] storing explanation failed", error.message);

    return NextResponse.json({ explanation });
  } catch (error) {
    if (error instanceof LLMBusyError) return NextResponse.json({ error: BUSY_MESSAGE }, { status: 503 });
    console.error("[careers] explain failed", (error as { message?: string })?.message ?? error);
    return NextResponse.json({ error: "Couldn't write the summary. Please try again." }, { status: 500 });
  }
}
