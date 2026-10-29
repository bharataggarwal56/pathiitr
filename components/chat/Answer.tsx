"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { normalizeCitations, type Source } from "@/lib/chat-shared";

// "[2]" -> a markdown link to the source, so it can be drawn as a citation chip.
// Numbers that aren't a real source are dropped rather than shown as broken citations.
function linkCitations(text: string, numbers: Set<number>, anchor: string) {
  return normalizeCitations(text).replace(/\[(\d+)\](?!\()/g, (_, n) =>
    numbers.has(Number(n)) ? `[${n}](#${anchor}-${n})` : "",
  );
}

// Source numbers the answer actually cites.
export function citedNumbers(text: string): number[] {
  return [...normalizeCitations(text).matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
}

export default function Answer({ text, sources, anchor }: { text: string; sources: Source[]; anchor: string }) {
  const numbers = new Set(sources.map((s) => s.n));
  const components: Components = {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-brand/60">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
    strong: ({ children }) => <strong className="font-semibold text-navy">{children}</strong>,
    a: ({ href, children }) => {
      if (href?.startsWith(`#${anchor}-`)) {
        return (
          <a
            href={href}
            className="ml-0.5 inline-flex h-4 min-w-4 -translate-y-1 items-center justify-center rounded bg-brand-tint px-1 align-baseline text-[0.65rem] font-semibold text-brand no-underline hover:bg-brand hover:text-white"
            aria-label={`Source ${children}`}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
          {children}
        </a>
      );
    },
  };

  return (
    <div className="text-[0.95rem] leading-relaxed text-ink">
      <ReactMarkdown components={components}>{linkCitations(text, numbers, anchor)}</ReactMarkdown>
    </div>
  );
}

const TRACK_LABELS: Record<string, string> = { curriculum: "Curriculum" };

export function SourceList({ sources, cited, anchor }: { sources: Source[]; cited: number[]; anchor: string }) {
  const shown = sources.filter((s) => cited.includes(s.n));
  if (shown.length === 0) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Sources</h3>
      <ol className="mt-2 space-y-2">
        {shown.map((s) => (
          <li key={s.n} id={`${anchor}-${s.n}`} className="flex scroll-mt-24 gap-2.5 text-sm">
            <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-brand-tint px-1 text-xs font-semibold text-brand">
              {s.n}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-navy">{s.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {s.tracks.map((t) => (
                  <span key={t} className="rounded-full border border-slate-200 px-2 py-0.5">
                    {TRACK_LABELS[t] ?? t}
                  </span>
                ))}
                {s.places.length > 0 && <span className="truncate">{s.places.slice(0, 3).join(" · ")}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
