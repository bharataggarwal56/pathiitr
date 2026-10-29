import { NextResponse, type NextRequest } from "next/server";
import { isAllowedSession } from "@/lib/auth";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { hasFigures, hasLinks } from "@/lib/careers/figures";
import { loadMatrix, loadProfile } from "@/lib/careers/profile";
import { SKILL_GAP_VERSION, gapInputHash, type GapEntry } from "@/lib/careers/skillgap";
import { trackSkillStatus, type SkillStatus } from "@/lib/careers/skills";
import { BUSY_MESSAGE, LLMBusyError, generate } from "@/lib/llm";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const YEAR_WORDS = ["", "first", "second", "third", "fourth", "fifth"];

const SYSTEM_PROMPT = `You are PathIITR, a friendly career guide for IIT Roorkee students.
You get the skills a student still needs for one career track. Suggest the order to learn them in.
Rules:
- Use only the skills in the list, with their names as given. Pick at most five, most useful first.
- Core skills usually come before nice-to-have ones; skills marked "partly" are often quick wins.
- One markdown bullet per skill, starting with "- " and the skill name in bold, then one short sentence on why it comes at that point.
- No numbered lists, no numbers or digits at all, no headings, no intro or closing line.
- Do not mention companies, salaries, stipends, cut-offs, links, people or resources.`;

function buildPrompt(track: Track, gaps: SkillStatus[], studyYear: number | null): string {
  const year = studyYear ? `The student is in their ${YEAR_WORDS[studyYear]} year.\n` : "";
  const lines = gaps.map(
    (s) => `- ${s.skill} (${s.level === "core" ? "core" : "nice to have"}, ${s.status === "weak" ? "partly" : "missing"})`,
  );
  return `${year}Track: ${track}\nSkills still to learn:\n${lines.join("\n")}`;
}

// POST {track, inputHash} -> {text}. Writes the "what to learn first" text for the user's current
// ratings on one track once and stores it in profiles.skill_gap[track]; later calls return the
// stored text without an LLM call. An empty string means the text failed our checks (not retried).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) {
    return NextResponse.json({ error: "Please log in with your IITR account." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const track = body?.track as Track;
  const inputHash = typeof body?.inputHash === "string" ? body.inputHash : "";
  if (!TRACKS.includes(track)) return NextResponse.json({ error: "Unknown track." }, { status: 400 });

  try {
    const profile = await loadProfile(supabase);
    if (!profile) return NextResponse.json({ error: "Please set up your profile first." }, { status: 409 });
    const skills = trackSkillStatus(track, await loadMatrix(supabase), profile.skillLevels);
    if (gapInputHash(track, skills, profile.studyYear) !== inputHash) {
      return NextResponse.json({ error: "Your profile has changed. Please reload the page." }, { status: 409 });
    }
    const stored = profile.skillGap[track];
    if (stored?.version === SKILL_GAP_VERSION && stored.inputHash === inputHash) {
      return NextResponse.json({ text: stored.text });
    }

    const gaps = skills.filter((s) => s.status !== "have");
    if (!gaps.length) return NextResponse.json({ text: "" });

    const result = await generate({ system: SYSTEM_PROMPT, prompt: buildPrompt(track, gaps, profile.studyYear), maxTokens: 500 });
    let text = result.text.trim();
    if (hasFigures(text) || hasLinks(text)) {
      console.warn("[skill-gap] priorities dropped: they contain figures or links");
      text = "";
    }

    const entry: GapEntry = { version: SKILL_GAP_VERSION, inputHash, text };
    const { error } = await supabase
      .from("profiles")
      .update({ skill_gap: { ...profile.skillGap, [track]: entry } })
      .eq("id", profile.id);
    if (error) console.error("[skill-gap] storing priorities failed", error.message);

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof LLMBusyError) return NextResponse.json({ error: BUSY_MESSAGE }, { status: 503 });
    console.error("[skill-gap] priorities failed", (error as { message?: string })?.message ?? error);
    return NextResponse.json({ error: "Couldn't write the priority order. Please try again." }, { status: 500 });
  }
}
