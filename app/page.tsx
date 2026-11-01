import { Suspense } from "react";
import { LogIn, ShieldCheck, SlidersHorizontal, Quote } from "lucide-react";
import AuthNotice from "@/components/AuthNotice";
import ExampleChat, { type ExampleAnswer } from "@/components/ExampleChat";
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

// Copied (shortened, wording unchanged) from a saved answer that cites only the official curriculum.
const EXAMPLE: ExampleAnswer = {
  question: "Which electives suit signal processing?",
  points: [
    ["ECL\u2011360 Introduction to Information and Communication Theory \u2013 focuses on signal processing and communications", 1],
    ["ECL\u2011514 Detection and Estimation Theory \u2013 covers signal processing and estimation techniques", 1],
    ["ECL\u2011519 Wireless Communication Systems \u2013 centered on signal processing for wireless links", 1],
    ["ECL\u2011618 Wireless Technologies: 5G and Beyond \u2013 deals with advanced signal processing for 5G", 1],
  ],
  sources: [{ n: 1, title: "Curriculum structure" }],
};

const STEPS = [
  { icon: LogIn, title: "Sign in with IITR Google", text: "Use your iitr.ac.in account. Nothing else to set up." },
  { icon: SlidersHorizontal, title: "Tell us your interests and skills", text: "Pick what you enjoy and what you already know." },
  { icon: Quote, title: "Get answers and plans with sources", text: "Every answer shows the document it came from." },
];

export default function Home() {
  return (
    <>
      <section className="bg-navy text-white">
        <div className="page-container pt-9 pb-8 sm:pt-14 sm:pb-10">
          <Suspense>
            <div className="mb-8 empty:hidden">
              <AuthNotice />
            </div>
          </Suspense>

          <div className="grid items-center gap-10 lg:grid-cols-[1fr_26rem] lg:gap-12">
            <div>
              <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[3.4rem]">
                Plan your path at IIT Roorkee, from first year to placement.
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-white/75 sm:text-xl">
                Careers, skills, electives and semester plans, answered from what your seniors learned.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <HeroCta />
                <a href="#how-it-works" className="btn btn-lg border border-white/30 text-white hover:bg-white/10">
                  How it works
                </a>
              </div>
            </div>
            <ExampleChat example={EXAMPLE} />
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
