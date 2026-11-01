// Static example on the landing page: one real question and a shortened real answer, copied from a
// saved chat that cites only the official curriculum (seniors' material stays behind login).
// Chips and the source list mirror components/chat/Answer.tsx.

export type ExampleAnswer = {
  question: string;
  // Paragraph or bullet text; each part is plain text or a citation number.
  points: (string | number)[][];
  sources: { n: number; title: string }[];
};

export default function ExampleChat({ example }: { example: ExampleAnswer }) {
  return (
    <figure className="rounded-2xl bg-surface p-4 text-ink shadow-xl shadow-navy/40 ring-1 ring-white/10 sm:p-5">
      <figcaption className="mb-3 flex items-center justify-between text-xs">
        <span className="rounded-full bg-brand-tint px-2.5 py-0.5 font-semibold tracking-wide text-brand uppercase">
          Example
        </span>
        <span className="text-muted">From a real PathIITR answer, shortened</span>
      </figcaption>
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-sm text-white">
        {example.question}
      </p>
      <div className="mt-3 rounded-2xl rounded-tl-sm border border-slate-200 px-4 py-3 text-sm leading-relaxed">
        <ul className="list-disc space-y-1.5 pl-5 marker:text-brand/60">
          {example.points.map((parts, i) => (
            <li key={i}>
              {parts.map((part, j) =>
                typeof part === "number" ? (
                  <span
                    key={j}
                    className="ml-0.5 inline-flex h-4 min-w-4 -translate-y-1 items-center justify-center rounded bg-brand-tint px-1 align-baseline text-[0.65rem] font-semibold text-brand"
                    aria-label={`Source ${part}`}
                  >
                    {part}
                  </span>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Sources</p>
          <ol className="mt-1.5 space-y-1">
            {example.sources.map((s) => (
              <li key={s.n} className="flex gap-2 text-xs">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand-tint px-1 font-semibold text-brand">
                  {s.n}
                </span>
                <span className="font-medium text-navy">{s.title}</span>
                <span className="rounded-full border border-slate-200 px-2 text-muted">Curriculum</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}
