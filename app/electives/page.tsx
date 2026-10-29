import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarDays, Info } from "lucide-react";
import { TRACKS, type Track } from "@/lib/chat-shared";
import { groupElectives, helpsTrack, type Elective } from "@/lib/careers/electives";
import { currentRecommendation, loadMatrix, loadProfile } from "@/lib/careers/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Electives | PathIITR" };

type Props = { searchParams: Promise<{ track?: string | string[] }> };

export default function ElectivesPage({ searchParams }: Props) {
  return (
    <div className="page-container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Electives</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Program electives, TEB baskets and open electives from the official curriculum, with the career tracks each one helps.
        </p>
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-navy" aria-hidden />
        Track suggestions are based on course titles; syllabi weren&apos;t available.
      </p>
      <Suspense fallback={<p className="text-muted">Loading electives...</p>}>
        <Electives searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Electives({ searchParams }: Props) {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const asked = (await searchParams).track;
  const supabase = await createClient();

  // Without a finished profile there is no top track, so the page opens on "All".
  let topTrack: Track | null = null;
  const profile = await loadProfile(supabase);
  if (profile) {
    const rows = await loadMatrix(supabase);
    topTrack = (await currentRecommendation(supabase, profile, rows)).top[0]?.track ?? null;
  }
  const track: Track | null = TRACKS.includes(asked as Track) ? (asked as Track) : asked === "all" ? null : topTrack;

  const { data, error } = await supabase
    .from("courses")
    .select("code, name, credits, elective_group, lists, tracks_helped, track_reason")
    .eq("category", "elective");
  if (error) return <p className="text-muted">Couldn&apos;t load electives right now. Please try again shortly.</p>;

  const groups = groupElectives((data ?? []) as Elective[], track);

  return (
    <div className="space-y-8">
      <nav aria-label="Tracks" className="flex flex-wrap gap-2">
        {[null, ...TRACKS].map((t) => (
          <Link
            key={t ?? "all"}
            href={`/electives?track=${t ? encodeURIComponent(t) : "all"}`}
            aria-current={t === track ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              t === track ? "border-navy bg-navy text-white" : "border-slate-300 bg-surface text-navy hover:border-brand"
            }`}
          >
            {t ?? "All"}
            {t !== null && t === topTrack && (
              <span className={t === track ? "text-accent-light" : "text-muted"}> · top match</span>
            )}
          </Link>
        ))}
      </nav>

      {groups.length === 0 && <p className="text-muted">No electives found.</p>}

      {groups.map((g, i) => (
        <section key={g.id}>
          {g.section === "TEB baskets" ? (
            groups[i - 1]?.section !== "TEB baskets" && (
              <h2 className="mb-3 text-lg font-semibold text-navy">TEB baskets</h2>
            )
          ) : (
            <h2 className="mb-3 text-lg font-semibold text-navy">{g.title}</h2>
          )}
          {g.section === "TEB baskets" && <h3 className="mb-2 text-sm font-semibold text-brand">{g.title}</h3>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.courses.map((c) => (
              <CourseCard key={c.code} course={c} track={track} />
            ))}
          </ul>
        </section>
      ))}

      <p className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-muted">
        <CalendarDays className="size-4" aria-hidden />
        <Link href="/roadmap" className="font-medium text-navy hover:underline">
          Your semester plan
        </Link>
        (coming soon)
      </p>
    </div>
  );
}

function CourseCard({ course: c, track }: { course: Elective; track: Track | null }) {
  const helps = helpsTrack(c, track);
  return (
    <li
      className={`rounded-xl border p-4 shadow-sm ${
        helps ? "border-brand bg-brand-tint ring-1 ring-brand/30" : "border-slate-200 bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">{c.code}</p>
          <h3 className="font-medium text-ink">{c.name}</h3>
        </div>
        <span className="shrink-0 text-sm text-muted">{c.credits} cr</span>
      </div>
      {helps && (
        <span className="mt-2 inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-navy">
          Helps {track}
        </span>
      )}
      {c.tracks_helped.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tracks it helps">
          {c.tracks_helped.map((t) => (
            <li
              key={t}
              className={`rounded px-1.5 py-0.5 text-xs ${
                t === track ? "bg-accent text-navy" : "bg-brand-tint text-navy"
              }`}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
      {c.track_reason && <p className="mt-2 text-sm text-muted">{c.track_reason}</p>}
    </li>
  );
}
