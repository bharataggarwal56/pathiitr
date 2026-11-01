"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

// Shown when a page throws. The error itself is logged on the server; we never show its details here.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page-container py-16 sm:py-24">
      <div className="card max-w-xl border-l-4 border-l-accent">
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">Something went wrong</h1>
        <p className="mt-2 text-muted">
          This page couldn&apos;t load. It&apos;s usually temporary, so please try again in a moment.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => retry()} className="btn-primary">
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
