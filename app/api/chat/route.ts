import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedSession } from "@/lib/auth";
import { BUSY_MESSAGE, LLMBusyError, generateStream } from "@/lib/llm";
import {
  MATCH_COUNT,
  MIN_SIMILARITY,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildPrompt,
  englishQuery,
  filterTracks,
  looksNonEnglish,
  numberSources,
  type MatchedChunk,
} from "@/lib/chat";
import {
  MAX_QUESTION_CHARS,
  NOT_COVERED_MESSAGE,
  RATE_LIMIT_MESSAGE,
  TRACKS,
  citeDocuments,
  type ChatEvent,
  type Track,
} from "@/lib/chat-shared";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Per user: at most RATE_LIMIT questions per RATE_WINDOW_MINUTES. CHAT_RATE_LIMIT overrides it
// in dev only, to test the limit without asking 15 questions.
const RATE_WINDOW_MINUTES = 10;
const RATE_LIMIT =
  process.env.NODE_ENV !== "production" && Number(process.env.CHAT_RATE_LIMIT) > 0
    ? Number(process.env.CHAT_RATE_LIMIT)
    : 15;
const MAX_MESSAGE_CHARS = 8000; // chat_messages.content check

// POST {question, track, conversationId} -> NDJSON stream of ChatEvent (see lib/chat-shared.ts).
// Everything runs as the logged-in user, so RLS applies to retrieval and to the saved messages.
export async function POST(request: NextRequest) {
  const started = Date.now();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) {
    return NextResponse.json({ error: "Please log in with your IITR account." }, { status: 401 });
  }

  let body: { question?: unknown; track?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: `Ask a question of 1-${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }
  const track = TRACKS.includes(body.track as Track) ? (body.track as Track) : null;
  const requestedConversationId = typeof body.conversationId === "string" ? body.conversationId : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        // 1. Rate limit, before any embedding or LLM call.
        const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
        const { count, error: countError } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("role", "user")
          .gte("created_at", since);
        if (countError) throw countError;
        if ((count ?? 0) >= RATE_LIMIT) {
          send({ type: "error", message: RATE_LIMIT_MESSAGE });
          return;
        }

        // 2. Save the question (and start a conversation if this is the first one).
        const saveQuestion = async (): Promise<string> => {
          let id = requestedConversationId;
          if (!id) {
            const { data, error } = await supabase
              .from("conversations")
              .insert({ title: question.slice(0, 200) })
              .select("id")
              .single();
            if (error) throw error;
            id = data.id as string;
          }
          const { error } = await supabase
            .from("chat_messages")
            .insert({ conversation_id: id, role: "user", content: question });
          if (error) throw error;
          return id;
        };

        // 3. Retrieve: Hinglish -> English query, embed with gte-small, nearest chunks.
        const retrieve = async () => {
          const searchQuery = looksNonEnglish(question) ? await englishQuery(question) : question;
          const { data: embedded, error: embedError } = await supabase.functions.invoke<{ embedding: number[] }>(
            "embed",
            { body: { input: searchQuery.slice(0, MAX_QUESTION_CHARS) }, timeout: 15_000 },
          );
          if (embedError || !embedded?.embedding) throw embedError ?? new Error("embed returned no vector");
          const { data, error } = await supabase.rpc("match_chunks", {
            query_embedding: JSON.stringify(embedded.embedding),
            match_count: MATCH_COUNT,
            filter_tracks: filterTracks(track),
          });
          if (error) throw error;
          return { searchQuery, matched: (data ?? []) as MatchedChunk[] };
        };

        // Independent, so in parallel: each Supabase round trip costs time.
        const [conversationId, { searchQuery, matched }] = await Promise.all([saveQuestion(), retrieve()]);
        if (process.env.NODE_ENV !== "production") {
          const top = matched.map((c) => `${c.id}=${c.similarity.toFixed(3)}`);
          console.info(
            `chat: ${Date.now() - started} ms to retrieve, track=${track ?? "all"} query="${searchQuery}" top: ${top.join(" ")}`,
          );
        }
        const chunks = matched.filter((c) => c.similarity >= MIN_SIMILARITY);
        const sources = numberSources(chunks);
        send({ type: "sources", sources, conversationId });

        // 4. Answer from those chunks only (or say it's not covered, without calling the LLM).
        let answer = "";
        let meta: { provider: string; model: string | null; cacheId: number | null; cached: boolean };
        if (chunks.length === 0) {
          answer = NOT_COVERED_MESSAGE;
          send({ type: "delta", text: answer });
          meta = { provider: "none", model: null, cacheId: null, cached: false };
        } else {
          const chunkIds = createHash("sha256").update(chunks.map((c) => c.id).join(",")).digest("hex");
          const result = await generateStream(
            {
              system: SYSTEM_PROMPT,
              prompt: buildPrompt(question, searchQuery, chunks),
              maxTokens: 1024,
              cache: {
                question,
                promptVersion: PROMPT_VERSION,
                scope: `track=${track ?? "all"}|chunks=${chunkIds.slice(0, 16)}`,
                citations: sources,
              },
            },
            // Sent raw: a citation can be split across pieces, so the page normalises the whole text.
            (text) => {
              answer += text;
              send({ type: "delta", text });
            },
          );
          meta = { provider: result.provider, model: result.model, cacheId: result.cacheId, cached: result.cached };
        }

        // 5. Save the answer so it can be rated.
        const { data: saved, error: saveError } = await supabase
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: citeDocuments(answer, sources).slice(0, MAX_MESSAGE_CHARS),
            citations: sources,
            provider: meta.provider,
            model: meta.model,
            cache_id: meta.cacheId,
          })
          .select("id")
          .single();
        if (saveError) console.warn(`chat: answer not saved (${saveError.message})`);
        send({ type: "done", messageId: saved?.id ?? null, provider: meta.provider, cached: meta.cached });
      } catch (error) {
        if (error instanceof LLMBusyError) {
          send({ type: "error", message: BUSY_MESSAGE });
        } else {
          console.error(`chat: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
          send({ type: "error", message: "Something went wrong. Please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
