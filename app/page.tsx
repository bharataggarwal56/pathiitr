import { Suspense } from "react";
import { LogIn, ShieldCheck, SlidersHorizontal, Quote } from "lucide-react";
import AuthNotice from "@/components/AuthNotice";
import FeatureGrid from "@/components/FeatureGrid";
import HeroCta from "@/components/HeroCta";
import stats from "@/lib/site-stats.json";

// Counts come from lib/site-stats.json, written by scripts/site_stats.py from data/work/.
const STATS = [
  { value: stats.tracks, label: "career tracks" },
  { value: stats.experiences, label: "experiences from seniors and CDC" },
  { value: stats.courses, label: "ECE courses" },
  { value: stats.documents, label: "source documents" },
];

const STEPS = [
  { icon: LogIn, title: "Sign in with IITR Google", text: "Use your iitr.ac.in account. Nothing else to set up." },
  { icon: SlidersHorizontal, title: "Tell us your interests and skills", text: "Pick what you enjoy and what you already know." },
  { icon: Quote, title: "Get answers and plans with sources", text: "Every answer shows the document it came from." },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <PathLine />
        <div className="page-container relative pt-9 pb-8 sm:pt-14 sm:pb-10">
          <Suspense>
            <div className="mb-8 empty:hidden">
              <AuthNotice />
            </div>
          </Suspense>

          <h1 className="max-w-4xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
            Plan your path at IIT Roorkee, from first year to placement.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75 sm:text-xl">
            Careers, skills, electives and semester plans, answered from what your seniors learned.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <HeroCta />
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-3 font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              How it works
            </a>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/15 pt-6 sm:mt-14 lg:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="mt-1 text-sm text-white/70">{label}</dt>
                <dd className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="page-container py-10 sm:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">What you can do</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Each tool answers from the same set of documents, so the advice stays consistent.
        </p>
        <FeatureGrid />
      </section>

      <section id="how-it-works" className="scroll-mt-28 border-y border-slate-200 bg-surface">
        <div className="page-container py-10 sm:py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">How it works</h2>
          <ol className="relative mt-7 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {/* The amber path joining the steps: down the left on mobile, across on desktop. */}
            <span
              aria-hidden
              className="absolute top-5 bottom-5 left-5 w-0.5 bg-accent/60 sm:top-5 sm:right-[16.66%] sm:bottom-auto sm:left-[16.66%] sm:h-0.5 sm:w-auto"
            />
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative flex gap-4 sm:flex-col sm:items-center sm:text-center">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-navy font-semibold text-white ring-4 ring-surface">
                  {i + 1}
                </span>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-navy sm:justify-center">
                    <Icon className="size-4 text-brand" aria-hidden />
                    {title}
                  </h3>
                  <p className="mt-1 text-sm text-muted sm:mx-auto sm:max-w-60">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-container py-8 sm:py-11">
        <p className="flex max-w-2xl gap-3 text-ink sm:mx-auto sm:flex-col sm:items-center sm:text-center">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-brand sm:mt-0" aria-hidden />
          <span>
            Built from seniors&apos; shared experiences and the official ECE curriculum. Answers always
            show their source. Personal details are removed.
          </span>
        </p>
      </section>
    </>
  );
}

// Decorative amber route across the hero, echoing the "path" in PathIITR.
function PathLine() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 400"
      preserveAspectRatio="xMaxYMid meet"
      className="pointer-events-none absolute top-0 right-0 h-[55%] w-full opacity-30 sm:h-[72%] sm:w-2/3 sm:opacity-70"
    >
      <path
        d="M40 380 C 180 360, 200 250, 320 230 S 470 140, 560 40"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeDasharray="2 10"
        strokeLinecap="round"
      />
      <circle cx="560" cy="40" r="6" fill="var(--color-accent)" />
      <circle cx="320" cy="230" r="4" fill="var(--color-navy)" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="40" cy="380" r="4" fill="var(--color-navy)" stroke="var(--color-accent)" strokeWidth="2" />
    </svg>
  );
}
