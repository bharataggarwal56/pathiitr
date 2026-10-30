"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import type { Recommendation } from "@/lib/careers/recommend";
import { skillAnchor } from "@/lib/careers/skillgap";

type ExplainState =
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

// The top 3 tracks with their rule-based reasons (shown at once), plus a short friendly
// explanation written by the LLM, fetched once and stored with the profile.
export default function Recommendations({ recommendation }: { recommendation: Recommendation }) {
  const { top, inputHash, explanation } = recommendation;
  const [explain, setExplain] = useState<ExplainState>(
    explanation === null ? { status: "loading" } : { status: "done", text: explanation },
  );

  const fetchExplanation = useCallback(async () => {
    setExplain({ status: "loading" });
    try {
      const response = await fetch("/api/careers/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputHash }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Couldn't write the summary. Please try again.");
      setExplain({ status: "done", text: body.explanation ?? "" });
    } catch (error) {
      setExplain({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [inputHash]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch when no summary is stored yet
    if (explanation === null) fetchExplanation();
  }, [explanation, fetchExplanation]);

  return (
    <div className="space-y-6">
      <Summary state={explain} onRetry={fetchExplanation} />

      <ol className="grid gap-4 md:grid-cols-3">
        {top.map((t, i) => (
          <li key={t.track} className="flex flex-col rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  i === 0 ? "bg-accent text-navy" : "bg-navy text-white"
                }`}
              >
                {i + 1}
              </span>
              <h2 className="text-lg font-semibold text-navy">{t.track}</h2>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Match</span>
                <span className="font-medium text-ink tabular-nums">{t.score}/100</span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-brand-tint"
                role="meter"
                aria-label={`${t.track} match`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={t.score}
              >
                <div className="h-full rounded-full bg-brand" style={{ width: `${t.score}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">You cover {t.skillFit}% of the skills seniors list for it.</p>
            </div>

            <ul className="mt-4 space-y-2 text-sm text-ink">
              {t.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  {r}
                </li>
              ))}
            </ul>

            {t.gaps.length > 0 && (
              <div className="mt-auto pt-4">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Next to learn</h3>
                <ul className="mt-1 space-y-1 text-sm text-ink">
                  {t.gaps.map((g) => (
                    <li key={g}>
                      <Link
                        href={`/skill-gap?track=${encodeURIComponent(t.track)}#${skillAnchor(g)}`}
                        className="hover:text-brand hover:underline"
                      >
                        {g}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/skill-gap?track=${encodeURIComponent(t.track)}`}
                  className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                >
                  See all {t.track} skills
                </Link>
              </div>
            )}
          </li>
        ))}
      </ol>

      <Link
        href="/profile"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-navy hover:border-brand"
      >
        <Pencil className="size-4" aria-hidden />
        Edit your profile
      </Link>
    </div>
  );
}

function Summary({ state, onRetry }: { state: ExplainState; onRetry: () => void }) {
  // An empty summary means the LLM's text failed our checks; the cards say it all anyway.
  if (state.status === "done" && !state.text) return null;
  return (
    <section className="rounded-xl border-l-4 border-accent bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        <Sparkles className="size-4 text-accent" aria-hidden />
        In short
      </h2>
      {state.status === "loading" && (
        <p className="mt-2 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Writing a short summary...
        </p>
      )}
      {state.status === "error" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink">{state.message}</p>
          <button
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-navy"
          >
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      )}
      {state.status === "done" && (
        <div className="mt-2 space-y-2 text-ink [&_strong]:text-navy">
          <ReactMarkdown>{state.text}</ReactMarkdown>
        </div>
      )}
    </section>
  );
}
