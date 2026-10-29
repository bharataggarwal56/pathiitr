"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";

type State = { status: "loading" } | { status: "done"; text: string } | { status: "error"; message: string };

type Props = {
  track: string;
  inputHash: string;
  storedText: string | null; // null when nothing is stored for these ratings yet
  hasGaps: boolean;
};

// "What to learn first": a short priority order written by the LLM from the student's gaps,
// fetched once per track and ratings and stored with the profile.
export default function Priorities({ track, inputHash, storedText, hasGaps }: Props) {
  const [state, setState] = useState<State>(
    storedText === null ? { status: "loading" } : { status: "done", text: storedText },
  );

  const fetchPriorities = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/skill-gap/priorities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, inputHash }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Couldn't write the priority order. Please try again.");
      setState({ status: "done", text: body.text ?? "" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [track, inputHash]);

  // Dev mode runs effects twice; the ref keeps that to one LLM call.
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current || !hasGaps || storedText !== null) return;
    fetched.current = true;
    fetchPriorities();
  }, [hasGaps, storedText, fetchPriorities]);

  if (!hasGaps) {
    return (
      <section className="rounded-xl border-l-4 border-accent bg-surface p-5 shadow-sm">
        <p className="text-ink">You&apos;ve covered every skill seniors list for {track}. Nice work.</p>
      </section>
    );
  }
  // An empty text means the LLM's answer failed our checks; the list below says it all anyway.
  if (state.status === "done" && !state.text) return null;

  return (
    <section className="rounded-xl border-l-4 border-accent bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        <Sparkles className="size-4 text-accent" aria-hidden />
        What to learn first
      </h2>
      {state.status === "loading" && (
        <p className="mt-2 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Working out an order...
        </p>
      )}
      {state.status === "error" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink">{state.message}</p>
          <button
            onClick={fetchPriorities}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-navy"
          >
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      )}
      {state.status === "done" && (
        <>
          <div className="mt-2 text-ink [&_strong]:text-navy">
            <ReactMarkdown
              components={{
                // The LLM writes "-" bullets (no digits allowed); they are shown as a numbered order.
                ul: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-muted">{children}</ol>,
              }}
            >
              {state.text}
            </ReactMarkdown>
          </div>
          <p className="mt-3 text-xs text-muted">Written by AI from your ratings. The full list is below.</p>
        </>
      )}
    </section>
  );
}
