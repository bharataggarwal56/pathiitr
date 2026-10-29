import { NextResponse, type NextRequest } from "next/server";
import { BUSY_MESSAGE, LLMBusyError, generate } from "@/lib/llm";

// Dev-only route to try lib/llm.ts: GET /api/llm-test?q=...&scope=...
// Off in production so logged-in users can't spend LLM quota through it.
// Signed-out users never reach it: proxy.ts redirects them.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const question = searchParams.get("q")?.trim() ?? "";
  if (!question || question.length > 500) {
    return NextResponse.json({ error: "Pass a question as ?q= (1-500 characters)." }, { status: 400 });
  }

  const started = Date.now();
  try {
    const result = await generate({
      system: "You are a helpful assistant for IIT Roorkee students. Answer in at most three sentences.",
      prompt: question,
      cache: { question, promptVersion: "test-v1", scope: searchParams.get("scope") ?? "test" },
    });
    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      model: result.model,
      cached: result.cached,
      ms: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof LLMBusyError) {
      return NextResponse.json({ error: BUSY_MESSAGE }, { status: 503 });
    }
    console.error(`llm-test: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
