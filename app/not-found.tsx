import type { Metadata } from "next";
import Link from "next/link";
import { Compass, MessageSquareText } from "lucide-react";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <section className="bg-navy text-white">
      <div className="page-container py-16 sm:py-24">
        <p className="font-mono text-sm text-accent-light">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">This path doesn&apos;t lead anywhere.</h1>
        <p className="mt-4 max-w-xl text-lg text-white/75">
          The page you were looking for isn&apos;t here. It may have moved, or the link may be mistyped.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-primary btn-lg">
            <Compass className="size-5" aria-hidden />
            Back to home
          </Link>
          <Link
            href="/chat"
            className="btn btn-lg border border-white/30 text-white hover:bg-white/10"
          >
            <MessageSquareText className="size-5" aria-hidden />
            Ask PathIITR
          </Link>
        </div>
      </div>
    </section>
  );
}
