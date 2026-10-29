import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { containsPersonalInfo } from "@/lib/pii";
import { createAdminClient } from "@/lib/supabase/admin";

// One wrapper for every LLM call: Groq first, Gemini free tier as fallback, optional answer cache.
// Models match scripts/structure.py.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GEMINI_MODEL = "gemini-3.5-flash";
const LLM_TIMEOUT_MS = 15_000;

export const BUSY_MESSAGE = "PathIITR is busy right now. Please try again shortly.";

// Both providers are rate-limited, timed out or down. Show BUSY_MESSAGE to the user.
export class LLMBusyError extends Error {
  constructor() {
    super(BUSY_MESSAGE);
    this.name = "LLMBusyError";
  }
}

// A provider failed in a way the next provider (or a later retry) might get past.
class RetryableError extends Error {}

type Provider = "groq" | "gemini";

export type GenerateOptions = {
  system: string;
  prompt: string;
  maxTokens?: number;
  // Only for answers that aren't personalised. `scope` is built by the caller, e.g.
  // "track=ECE Core|data=<chunk count or load date>", so a different filter or a data reload
  // never returns an old answer.
  cache?: { question: string; promptVersion: string; scope?: string; citations?: unknown[] };
};

export type GenerateResult = {
  text: string;
  provider: Provider | "cache";
  model: string | null;
  cached: boolean;
  cacheId: number | null;
  citations: unknown[];
};

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const maxTokens = opts.maxTokens ?? 1024;
  // Questions with personal details never touch the cache, so they are never stored.
  const cache = opts.cache && !containsPersonalInfo(opts.cache.question) ? opts.cache : undefined;
  const cacheKey = cache ? makeCacheKey(cache.promptVersion, cache.scope, cache.question) : null;

  if (cacheKey) {
    const hit = await readCache(cacheKey);
    if (hit) return hit;
  }

  let provider: Provider = "groq";
  let model = GROQ_MODEL;
  let text: string;
  try {
    text = await callGroq(opts.system, opts.prompt, maxTokens);
  } catch (error) {
    if (!(error instanceof RetryableError)) throw error;
    console.warn(`llm: Groq failed, falling back to Gemini (${error.message})`);
    provider = "gemini";
    model = GEMINI_MODEL;
    try {
      text = await callGemini(opts.system, opts.prompt, maxTokens);
    } catch (fallbackError) {
      if (!(fallbackError instanceof RetryableError)) throw fallbackError;
      console.warn(`llm: Gemini failed too (${fallbackError.message})`);
      throw new LLMBusyError();
    }
  }

  const citations = cache?.citations ?? [];
  let cacheId: number | null = null;
  if (cache && cacheKey) {
    cacheId = await writeCache(cacheKey, cache.question, text, citations, provider, model, cache.promptVersion);
  }
  return { text, provider, model, cached: false, cacheId, citations };
}

function makeCacheKey(promptVersion: string, scope: string | undefined, question: string) {
  const normalised = question.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(JSON.stringify([promptVersion, scope ?? "", normalised]))
    .digest("hex");
}

async function readCache(cacheKey: string): Promise<GenerateResult | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("llm_cache")
      .select("id, answer, citations, model, hit_count")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // Not atomic; an occasional lost count doesn't matter.
    after(async () => {
      const { error: bumpError } = await supabase
        .from("llm_cache")
        .update({ hit_count: data.hit_count + 1, last_hit_at: new Date().toISOString() })
        .eq("id", data.id);
      if (bumpError) console.warn(`llm: cache hit count not updated (${bumpError.message})`);
    });
    return {
      text: data.answer,
      provider: "cache",
      model: data.model,
      cached: true,
      cacheId: data.id,
      citations: data.citations,
    };
  } catch (error) {
    // The cache must never make a request fail.
    console.warn(`llm: cache read failed (${errorMessage(error)})`);
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  question: string,
  answer: string,
  citations: unknown[],
  provider: Provider,
  model: string,
  promptVersion: string,
): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("llm_cache")
      .upsert(
        { cache_key: cacheKey, question, answer, citations, provider, model, prompt_version: promptVersion },
        { onConflict: "cache_key" },
      )
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    console.warn(`llm: cache write failed (${errorMessage(error)})`);
    return null;
  }
}

async function callGroq(system: string, prompt: string, maxTokens: number): Promise<string> {
  debugFail("groq");
  const response = await post(
    "Groq",
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      reasoning_effort: "low",
      temperature: 0.2,
      max_completion_tokens: maxTokens,
    },
  );
  const text = response?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new RetryableError("Groq returned no text");
  return text;
}

async function callGemini(system: string, prompt: string, maxTokens: number): Promise<string> {
  debugFail("gemini");
  const response = await post(
    "Gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
    },
  );
  const parts: { text?: string; thought?: boolean }[] = response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  if (!text.trim()) throw new RetryableError("Gemini returned no text");
  return text;
}

// POST JSON with a timeout. Rate limits (429), over-limit requests (413), server errors, timeouts
// and network errors are retryable; any other error (bad key, bad request) is a real bug and is
// thrown as is. Logs and errors carry the status only, never the prompt or keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(name: string, url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new RetryableError(`${name} ${describeFetchError(error)}`);
  }
  if (response.ok) return response.json();
  if (response.status === 429 || response.status === 413 || response.status >= 500) {
    throw new RetryableError(`${name} HTTP ${response.status}`);
  }
  throw new Error(`${name} HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

// Dev only: LLM_DEBUG_FAIL=groq|both makes that provider act as if rate-limited.
function debugFail(provider: Provider) {
  if (process.env.NODE_ENV === "production") return;
  const mode = process.env.LLM_DEBUG_FAIL;
  if (mode === "both" || mode === provider) {
    throw new RetryableError(`${provider} HTTP 429 (simulated by LLM_DEBUG_FAIL)`);
  }
}

// "timed out after 15s", or the network error with its cause (e.g. "fetch failed: ECONNRESET").
function describeFetchError(error: unknown) {
  if (!(error instanceof Error)) return "network error";
  if (error.name === "TimeoutError") return `timed out after ${LLM_TIMEOUT_MS / 1000}s`;
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return `${error.name}: ${error.message}${detail ? ` (${detail})` : ""}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
}
