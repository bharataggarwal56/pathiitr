import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
          Plan your path at IIT Roorkee
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Career and academic guidance built from seniors&apos; experience and the official
          curriculum. Answers always cite where they came from.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map(({ href, label, blurb }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-slate-200 bg-surface p-5 transition hover:border-brand hover:shadow-sm"
          >
            <h2 className="font-semibold text-brand group-hover:text-navy">{label}</h2>
            <p className="mt-1 text-sm text-muted">{blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
